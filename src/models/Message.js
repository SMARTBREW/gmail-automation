import mongoose from '../db/mongo.js';

const MessageSchema = new mongoose.Schema(
  {
    gmailThreadId: { type: String, index: true },
    gmailMessageId: { type: String, index: true, unique: true },
    from: { type: String, index: true },
    to: { type: String, index: true },
    subject: { type: String },
    bodySnippet: { type: String },
    lastMessageDate: { type: Date, index: true },
    status: {
      type: String,
      enum: ['pending', 'generated', 'sent', 'error'],
      default: 'pending',
      index: true,
    },
    generatedBody: { type: String },
    error: { type: String },
  },
  { timestamps: true }
);

export const Message = mongoose.models.Message || mongoose.model('Message', MessageSchema);


