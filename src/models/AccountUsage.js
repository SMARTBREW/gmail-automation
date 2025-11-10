import mongoose from '../db/mongo.js';

const AccountUsageSchema = new mongoose.Schema(
  {
    email: { type: String, unique: true, index: true },
    sentToday: { type: Number, default: 0 },
    lastSentAt: { type: Date },
    resetAt: { type: Date }, // next reset timestamp
  },
  { timestamps: true }
);

AccountUsageSchema.index({ email: 1 }, { unique: true });

export const AccountUsage =
  mongoose.models.AccountUsage || mongoose.model('AccountUsage', AccountUsageSchema);


