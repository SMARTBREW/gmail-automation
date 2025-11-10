import mongoose from '../db/mongo.js';

const CampaignTemplateSchema = new mongoose.Schema(
  {
    campaignName: { type: String, unique: true, index: true },
    subjectLines: {
      type: Map,
      of: String,
      default: {},
    },
    templates: {
      type: Map,
      of: String,
      default: {},
    },
  },
  { timestamps: true }
);

export const CampaignTemplate =
  mongoose.models.CampaignTemplate || mongoose.model('CampaignTemplate', CampaignTemplateSchema);


