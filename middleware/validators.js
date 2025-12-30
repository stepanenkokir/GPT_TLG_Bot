import Joi from "joi";

/**
 * Validation schemas for different data types
 */

/**
 * Message validation schema
 * Validates OpenAI chat message format
 */
export const messageSchema = Joi.object({
  role: Joi.string().valid("user", "assistant", "system").required(),
  content: Joi.alternatives()
    .try(
      Joi.string().min(1).max(100000), // String content
      Joi.array().items(
        // Array content (for multimodal)
        Joi.object({
          type: Joi.string().valid("text", "image_url").required(),
          text: Joi.when("type", {
            is: "text",
            then: Joi.string().required(),
            otherwise: Joi.optional(),
          }),
          image_url: Joi.when("type", {
            is: "image_url",
            then: Joi.object({
              url: Joi.string().uri().required(),
            }).required(),
            otherwise: Joi.optional(),
          }),
        })
      )
    )
    .required(),
});

/**
 * Messages array validation schema
 */
export const messagesSchema = Joi.array().items(messageSchema).min(1).max(100);

/**
 * Validate messages array
 * @param {Array} messages - Array of messages to validate
 * @returns {{valid: boolean, error?: string}} Validation result
 */
export function validateMessages(messages) {
  if (!Array.isArray(messages)) {
    return { valid: false, error: "Messages must be an array" };
  }

  const { error } = messagesSchema.validate(messages, { abortEarly: false });
  if (error) {
    const details = error.details.map((d) => d.message).join("; ");
    return { valid: false, error: details };
  }

  return { valid: true };
}

/**
 * Role validation schema for API endpoints
 */
export const roleSchema = Joi.object({
  role: Joi.string()
    .valid("default", "doctor", "teacher", "hooligan")
    .required(),
  voice: Joi.string()
    .valid("echo", "ash", "sage", "alloy", "ballad", "nova", "shimmer")
    .required(),
  name: Joi.string().min(1).max(100).required(),
});

/**
 * Validate role data
 * @param {object} data - Role data to validate
 * @returns {{valid: boolean, error?: string}} Validation result
 */
export function validateRole(data) {
  const { error } = roleSchema.validate(data, { abortEarly: false });
  if (error) {
    const details = error.details.map((d) => d.message).join("; ");
    return { valid: false, error: details };
  }
  return { valid: true };
}

/**
 * Text message validation schema
 */
export const textMessageSchema = Joi.object({
  text: Joi.string().min(1).max(10000).required(),
});

/**
 * Validate text message
 * @param {object} data - Text message data
 * @returns {{valid: boolean, error?: string}} Validation result
 */
export function validateTextMessage(data) {
  const { error } = textMessageSchema.validate(data, { abortEarly: false });
  if (error) {
    const details = error.details.map((d) => d.message).join("; ");
    return { valid: false, error: details };
  }
  return { valid: true };
}
