import { body, param, query } from 'express-validator';

// Auth validators
export const registerValidator = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('username')
    .isLength({ min: 3, max: 30 })
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('Username must be 3-30 characters and contain only letters, numbers, underscore, or dash'),
  body('password')
    .isLength({ min: 8 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must be at least 8 characters with uppercase, lowercase, number, and special character'),
  body('firstName')
    .optional()
    .isLength({ min: 1, max: 50 })
    .withMessage('First name must be 1-50 characters'),
  body('lastName')
    .optional()
    .isLength({ min: 1, max: 50 })
    .withMessage('Last name must be 1-50 characters')
];

export const loginValidator = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
];

// Chat validators
export const createChatRoomValidator = [
  body('name')
    .isLength({ min: 1, max: 100 })
    .withMessage('Chat room name must be 1-100 characters'),
  body('description')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Description must be less than 500 characters'),
  body('type')
    .optional()
    .isIn(['PRIVATE', 'PUBLIC', 'GROUP'])
    .withMessage('Invalid chat room type'),
  body('maxMembers')
    .optional()
    .isInt({ min: 2, max: 100 })
    .withMessage('Max members must be between 2 and 100')
];

export const sendMessageValidator = [
  body('content')
    .isLength({ min: 1, max: 4000 })
    .withMessage('Message content must be 1-4000 characters'),
  body('type')
    .optional()
    .isIn(['TEXT', 'IMAGE', 'FILE'])
    .withMessage('Invalid message type')
];

export const chatRoomIdValidator = [
  param('chatRoomId')
    .isString()
    .notEmpty()
    .withMessage('Valid chat room ID is required')
];

// Pagination validators
export const paginationValidator = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .toInt()
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .toInt()
    .withMessage('Limit must be between 1 and 100')
];

// User update validators
export const updateProfileValidator = [
  body('firstName')
    .optional()
    .isLength({ min: 1, max: 50 })
    .withMessage('First name must be 1-50 characters'),
  body('lastName')
    .optional()
    .isLength({ min: 1, max: 50 })
    .withMessage('Last name must be 1-50 characters'),
  body('username')
    .optional()
    .isLength({ min: 3, max: 30 })
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('Username must be 3-30 characters and contain only letters, numbers, underscore, or dash')
];