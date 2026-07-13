import mongoose from '../db/mongo.js';

const CampaignSchema = new mongoose.Schema(
  {
    campaignName: { type: String, index: true },
    to: { type: String, index: true },
    from: { type: String, index: true },
    displayName: { type: String },
    subject: { type: String },
    touchpoint: { type: Number, default: 1, min: 1, max: 7, index: true },
    replied: { type: Boolean, default: false, index: true },
    lastSent: { type: Date, index: true },
    recipientName: { type: String },
    company: { type: String },
    trackingId: { type: String, index: true, sparse: true },
    resumeClickedAt: { type: Date, index: true },
    resumeClickCount: { type: Number, default: 0 },
    bounced: { type: Boolean, default: false, index: true },
    bouncedAt: { type: Date },
    bounceReason: { type: String },
    generatedBodies: { type: [String], default: [] },
    threadId: { type: String, index: true },
    messageIds: { type: [String], default: [] },
    internetMessageId: { type: String },
    allInternetMessageIds: { type: [String], default: [] },
    lastReplyCheck: { type: Date, index: true }, // Track when we last checked for replies
    repliedAt: { type: Date, index: true },
    replyFrom: { type: String },
    replyEmail: { type: String, index: true },
    replySubject: { type: String },
    replySnippet: { type: String },
    replyBody: { type: String },
    replyMessageId: { type: String },
  },
  { 
    timestamps: true,
    strict: true, // Explicitly reject fields not in schema
    strictQuery: true // Also reject in queries
  }
);

export const Campaign = mongoose.models.Campaign || mongoose.model('Campaign', CampaignSchema);


