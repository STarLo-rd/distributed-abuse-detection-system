import * as tf from '@tensorflow/tfjs-node';
import * as toxicity from '@tensorflow-models/toxicity';
import { InferenceSession, Tensor } from 'onnxruntime-node';
import { configManager } from '../config';
import { logger } from '../logger';
import { IModelPrediction, MLError, ContentType } from '../types';

/**
 * ML Inference Manager - Singleton Pattern
 * Handles machine learning model loading and inference for content moderation
 */
export class MLInferenceManager {
  private static instance: MLInferenceManager;
  private textModel?: toxicity.ToxicityClassifier;
  private imageModel?: InferenceSession;
  private audioModel?: InferenceSession;
  private isInitialized = false;

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor() {
    // Constructor is private
  }

  /**
   * Get singleton instance of MLInferenceManager
   * @returns {MLInferenceManager} The singleton instance
   */
  public static getInstance(): MLInferenceManager {
    if (!MLInferenceManager.instance) {
      MLInferenceManager.instance = new MLInferenceManager();
    }
    return MLInferenceManager.instance;
  }

  /**
   * Initialize all ML models
   * @returns {Promise<void>} Promise that resolves when models are loaded
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    const mlConfig = configManager.getMLConfig();
    
    try {
      logger.info('Initializing ML models...');
      
      // Initialize models in parallel
      await Promise.all([
        this.initializeTextModel(mlConfig.textModel),
        this.initializeImageModel(mlConfig.imageModel),
        this.initializeAudioModel(mlConfig.audioModel),
      ]);

      this.isInitialized = true;
      logger.info('All ML models initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize ML models', error as Error);
      throw new MLError('Failed to initialize ML inference engine');
    }
  }

  /**
   * Initialize text toxicity model
   * @param {object} modelConfig - Text model configuration
   * @returns {Promise<void>} Promise that resolves when model is loaded
   * @private
   */
  private async initializeTextModel(modelConfig: { enabled: boolean; threshold: number }): Promise<void> {
    if (!modelConfig.enabled) {
      logger.info('Text model disabled, skipping initialization');
      return;
    }

    try {
      logger.info('Loading text toxicity model...');
      this.textModel = await toxicity.load(modelConfig.threshold);
      logger.info('Text toxicity model loaded successfully');
    } catch (error) {
      logger.error('Failed to load text toxicity model', error as Error);
      throw new MLError('Failed to load text toxicity model', 'text');
    }
  }

  /**
   * Initialize image classification model
   * @param {object} modelConfig - Image model configuration
   * @returns {Promise<void>} Promise that resolves when model is loaded
   * @private
   */
  private async initializeImageModel(modelConfig: { enabled: boolean; path: string }): Promise<void> {
    if (!modelConfig.enabled) {
      logger.info('Image model disabled, skipping initialization');
      return;
    }

    try {
      logger.info('Loading image classification model...');
      this.imageModel = await InferenceSession.create(modelConfig.path);
      logger.info('Image classification model loaded successfully');
    } catch (error) {
      logger.error('Failed to load image classification model', error as Error);
      throw new MLError('Failed to load image classification model', 'image');
    }
  }

  /**
   * Initialize audio classification model
   * @param {object} modelConfig - Audio model configuration
   * @returns {Promise<void>} Promise that resolves when model is loaded
   * @private
   */
  private async initializeAudioModel(modelConfig: { enabled: boolean; path: string }): Promise<void> {
    if (!modelConfig.enabled) {
      logger.info('Audio model disabled, skipping initialization');
      return;
    }

    try {
      logger.info('Loading audio classification model...');
      this.audioModel = await InferenceSession.create(modelConfig.path);
      logger.info('Audio classification model loaded successfully');
    } catch (error) {
      logger.error('Failed to load audio classification model', error as Error);
      throw new MLError('Failed to load audio classification model', 'audio');
    }
  }

  /**
   * Predict toxicity for text content
   * @param {string} text - Text content to analyze
   * @returns {Promise<IModelPrediction>} Prediction result
   */
  public async predictText(text: string): Promise<IModelPrediction> {
    if (!this.textModel) {
      throw new MLError('Text model is not initialized', 'text');
    }

    const startTime = Date.now();

    try {
      logger.debug('Analyzing text content', { textLength: text.length });

      const predictions = await this.textModel.classify([text]);
      const processingTime = Date.now() - startTime;

      // Process predictions to find the highest confidence toxic category
      let maxConfidence = 0;
      let toxicCategories: string[] = [];
      const rawScores: Record<string, number> = {};

      predictions.forEach(prediction => {
        const match = prediction.results[0];
        if (match && match.match) {
          const confidence = match.probabilities[1]; // Probability of being toxic
          rawScores[prediction.label] = confidence;
          
          if (confidence > maxConfidence) {
            maxConfidence = confidence;
          }
          
          if (confidence > 0.5) { // Threshold for considering as toxic
            toxicCategories.push(prediction.label);
          }
        }
      });

      const isToxic = maxConfidence > configManager.getMLConfig().textModel.threshold;
      
      logger.debug('Text analysis completed', {
        textLength: text.length,
        processingTime,
        maxConfidence,
        isToxic,
        categories: toxicCategories,
      });

      return {
        label: isToxic ? 'toxic' : 'clean',
        confidence: maxConfidence,
        categories: toxicCategories,
        rawScores,
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error('Text analysis failed', {
        textLength: text.length,
        processingTime,
        error: error as Error,
      });
      throw new MLError(`Text analysis failed: ${(error as Error).message}`, 'text');
    }
  }

  /**
   * Predict content classification for image
   * @param {Buffer} imageBuffer - Image buffer to analyze
   * @returns {Promise<IModelPrediction>} Prediction result
   */
  public async predictImage(imageBuffer: Buffer): Promise<IModelPrediction> {
    if (!this.imageModel) {
      throw new MLError('Image model is not initialized', 'image');
    }

    const startTime = Date.now();

    try {
      logger.debug('Analyzing image content', { imageSize: imageBuffer.length });

      // Preprocess image (this is a simplified example)
      const tensor = await this.preprocessImage(imageBuffer);
      
      // Run inference
      const feeds = { input: tensor };
      const results = await this.imageModel.run(feeds);
      
      const processingTime = Date.now() - startTime;

      // Process results (this depends on your specific model)
      const outputTensor = results.output as Tensor;
      const predictions = outputTensor.data as Float32Array;
      
      // Assuming binary classification (safe/unsafe)
      const confidence = predictions[1]; // Unsafe probability
      const threshold = configManager.getMLConfig().imageModel.threshold;
      const isUnsafe = confidence > threshold;

      logger.debug('Image analysis completed', {
        imageSize: imageBuffer.length,
        processingTime,
        confidence,
        isUnsafe,
      });

      return {
        label: isUnsafe ? 'unsafe' : 'safe',
        confidence,
        categories: isUnsafe ? ['inappropriate_content'] : [],
        rawScores: {
          safe: predictions[0],
          unsafe: predictions[1],
        },
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error('Image analysis failed', {
        imageSize: imageBuffer.length,
        processingTime,
        error: error as Error,
      });
      throw new MLError(`Image analysis failed: ${(error as Error).message}`, 'image');
    }
  }

  /**
   * Predict content classification for audio
   * @param {Buffer} audioBuffer - Audio buffer to analyze
   * @returns {Promise<IModelPrediction>} Prediction result
   */
  public async predictAudio(audioBuffer: Buffer): Promise<IModelPrediction> {
    if (!this.audioModel) {
      throw new MLError('Audio model is not initialized', 'audio');
    }

    const startTime = Date.now();

    try {
      logger.debug('Analyzing audio content', { audioSize: audioBuffer.length });

      // Preprocess audio (this is a simplified example)
      const tensor = await this.preprocessAudio(audioBuffer);
      
      // Run inference
      const feeds = { input: tensor };
      const results = await this.audioModel.run(feeds);
      
      const processingTime = Date.now() - startTime;

      // Process results (this depends on your specific model)
      const outputTensor = results.output as Tensor;
      const predictions = outputTensor.data as Float32Array;
      
      // Assuming binary classification (appropriate/inappropriate)
      const confidence = predictions[1]; // Inappropriate probability
      const threshold = configManager.getMLConfig().audioModel.threshold;
      const isInappropriate = confidence > threshold;

      logger.debug('Audio analysis completed', {
        audioSize: audioBuffer.length,
        processingTime,
        confidence,
        isInappropriate,
      });

      return {
        label: isInappropriate ? 'inappropriate' : 'appropriate',
        confidence,
        categories: isInappropriate ? ['inappropriate_audio'] : [],
        rawScores: {
          appropriate: predictions[0],
          inappropriate: predictions[1],
        },
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error('Audio analysis failed', {
        audioSize: audioBuffer.length,
        processingTime,
        error: error as Error,
      });
      throw new MLError(`Audio analysis failed: ${(error as Error).message}`, 'audio');
    }
  }

  /**
   * Preprocess image buffer for model input
   * @param {Buffer} imageBuffer - Raw image buffer
   * @returns {Promise<Tensor>} Preprocessed tensor
   * @private
   */
  private async preprocessImage(imageBuffer: Buffer): Promise<Tensor> {
    try {
      // Decode image using TensorFlow.js
      const imageTensor = tf.node.decodeImage(imageBuffer, 3);
      
      // Resize to model input size (assuming 224x224)
      const resized = tf.image.resizeBilinear(imageTensor, [224, 224]);
      
      // Normalize pixel values to [0, 1]
      const normalized = resized.div(255.0);
      
      // Add batch dimension
      const batched = normalized.expandDims(0);
      
      // Convert to ONNX tensor format
      const data = await batched.data();
      const tensor = new Tensor('float32', data, [1, 224, 224, 3]);
      
      // Clean up TensorFlow tensors
      imageTensor.dispose();
      resized.dispose();
      normalized.dispose();
      batched.dispose();
      
      return tensor;
    } catch (error) {
      logger.error('Image preprocessing failed', error as Error);
      throw new MLError('Image preprocessing failed', 'image');
    }
  }

  /**
   * Preprocess audio buffer for model input
   * @param {Buffer} audioBuffer - Raw audio buffer
   * @returns {Promise<Tensor>} Preprocessed tensor
   * @private
   */
  private async preprocessAudio(audioBuffer: Buffer): Promise<Tensor> {
    try {
      // This is a simplified example - real audio preprocessing would involve
      // converting to spectrograms, MFCC features, etc.
      
      // Convert buffer to float32 array (assuming 16-bit PCM)
      const samples = new Float32Array(audioBuffer.length / 2);
      for (let i = 0; i < samples.length; i++) {
        samples[i] = audioBuffer.readInt16LE(i * 2) / 32768.0;
      }
      
      // Create tensor (shape depends on your model requirements)
      const tensor = new Tensor('float32', samples, [1, samples.length]);
      
      return tensor;
    } catch (error) {
      logger.error('Audio preprocessing failed', error as Error);
      throw new MLError('Audio preprocessing failed', 'audio');
    }
  }

  /**
   * Predict content based on content type
   * @param {ContentType} contentType - Type of content to analyze
   * @param {string | Buffer} content - Content to analyze
   * @returns {Promise<IModelPrediction>} Prediction result
   */
  public async predict(contentType: ContentType, content: string | Buffer): Promise<IModelPrediction> {
    if (!this.isInitialized) {
      throw new MLError('ML inference engine is not initialized');
    }

    switch (contentType) {
      case ContentType.TEXT:
        if (typeof content !== 'string') {
          throw new MLError('Text content must be a string', 'text');
        }
        return this.predictText(content);
        
      case ContentType.IMAGE:
        if (!Buffer.isBuffer(content)) {
          throw new MLError('Image content must be a Buffer', 'image');
        }
        return this.predictImage(content);
        
      case ContentType.AUDIO:
        if (!Buffer.isBuffer(content)) {
          throw new MLError('Audio content must be a Buffer', 'audio');
        }
        return this.predictAudio(content);
        
      default:
        throw new MLError(`Unsupported content type: ${contentType}`);
    }
  }

  /**
   * Get model initialization status
   * @returns {boolean} True if all models are initialized
   */
  public isMLInitialized(): boolean {
    return this.isInitialized;
  }

  /**
   * Get model status for monitoring
   * @returns {object} Model status information
   */
  public getModelStatus(): object {
    const mlConfig = configManager.getMLConfig();
    
    return {
      initialized: this.isInitialized,
      models: {
        text: {
          enabled: mlConfig.textModel.enabled,
          loaded: !!this.textModel,
          threshold: mlConfig.textModel.threshold,
        },
        image: {
          enabled: mlConfig.imageModel.enabled,
          loaded: !!this.imageModel,
          threshold: mlConfig.imageModel.threshold,
        },
        audio: {
          enabled: mlConfig.audioModel.enabled,
          loaded: !!this.audioModel,
          threshold: mlConfig.audioModel.threshold,
        },
      },
    };
  }
}

/**
 * Export singleton instance
 */
export const mlInference = MLInferenceManager.getInstance(); 