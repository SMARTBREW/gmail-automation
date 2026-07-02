import mongoose from '../db/mongo.js';

const OutboxSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['initial', 'followup'], required: true },
    from: { type: String, required: true, index: true },
    to: { type: String, required: true },
    subject: { type: String, required: true },
    body: { type: String }, // Optional - deleted after sending to save space
    idempotencyKey: { type: String }, // unique index defined below
    headers: {
      threadId: { type: String },
      inReplyTo: { type: String },
      references: { type: String },
    },
    campaignRef: {
      campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign' },
      campaignName: { type: String },
      originalSubject: { type: String },
      recipientName: { type: String }, // Added to schema to ensure proper updates
      company: { type: String },
      trackingId: { type: String },
    },
    notBefore: { type: Date, default: () => new Date() },
    status: { type: String, enum: ['pending', 'sending', 'sent', 'failed'], default: 'pending', index: true },
    claimedAt: { type: Date },
    workerId: { type: String },
    attempts: { type: Number, default: 0 },
    lastError: { type: String },
  },
  { timestamps: true }
);

// Helpful indexes for queue scanning
// Primary index for claimJobAtomically query: { status: 'pending', notBefore: { $lte: now } } sorted by { notBefore: 1, createdAt: 1 }
OutboxSchema.index({ status: 1, notBefore: 1, createdAt: 1 });
OutboxSchema.index({ status: 1, notBefore: 1, from: 1 }); // Keep for account-specific queries
OutboxSchema.index({ claimedAt: 1 }, { sparse: true });
OutboxSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });

export const Outbox = mongoose.models.Outbox || mongoose.model('Outbox', OutboxSchema);


