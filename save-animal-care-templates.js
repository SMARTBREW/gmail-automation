import dotenv from 'dotenv';
dotenv.config();
import { connectMongo } from './src/db/mongo.js';
import { CampaignTemplate } from './src/models/CampaignTemplate.js';
await connectMongo();

const campaignName = 'Animal Care';

const footerBlock = `<p>Pawsitive Protectors | Animal Care<br>
Animal Care is a registered and verified charity based out of India.<br>
Reg No. 2023/16/IV/1478 | 80G: AAKTA4778M24DL02 | PAN: AAKTA4778M</p>`;

const templates = {
  1: `<p>Dear {recipientName},</p>
<p>I'm {senderName}, a volunteer with Pawsitive Protectors - Animal Care's grassroots effort to vaccinate, deworm, and collar street dogs and cats, while caring for the sick and injured in our shelters. Protecting strays and communities, one neighbourhood at a time.</p>
<p>I'm reaching out because I believe you care about the voiceless. People who've truly loved an animal tend to carry that beyond their homes - in the way they slow down for the dog at the gate, or pause for the one curled up on cold pavement. That kind of heart is rare. And it's exactly what this cause needs.</p>
<p>India has a real shot at zero rabies deaths by 2030. The science is clear. The gap is people.</p>
<p>I'd love to invite you to be a Pawsitive Protectors Ambassador - and share how your voice can help usher in that change.</p>
<p>Would you be open to a brief conversation if this resonates? I'd love to share more.</p>
<p>Warmly,<br>
{senderName}</p>
${footerBlock}`,

  2: `<p>Hey {recipientName},</p>
<p>Hope you are doing great. I didn't want to send just another follow-up, so I thought I'd share something instead.</p>
<p>Last Saturday, our team was out on the streets in Gurgaon. One of the dogs we vaccinated - a young female, skittish at first - sat completely still once she realised no one was going to hurt her. Our paravet said she'd probably never been touched with kindness before.</p>
<p>She got her vaccine. She got a chew stick. She went back to her corner of the street, a little safer than before.</p>
<p>That's what Pawsitive Protectors does, one animal at a time. And that's what your voice as an Ambassador could help us do at scale.</p>
<p>We are so much looking forward to speaking with you if this is something you'd like to take forward.</p>
<p>With hope,<br>
{senderName}</p>
${footerBlock}`,

  3: `<p>Dear {recipientName},</p>
<p>Sharing a few facts I think you'd want to know:</p>
<p>India accounts for roughly 36% of all rabies deaths globally. Nearly all of them are preventable. The science is settled - vaccinate 70% of a street dog population and human transmission stops.</p>
<p>The barrier isn't resources. It isn't willpower. It's awareness - and the credible voices willing to carry it.</p>
<p>That's why I keep thinking of you. An Ambassador like you can make all the difference.</p>
<p>Would you give me a couple of minutes to share what that looks like in practice?</p>
<p>Warmly,<br>
{senderName}</p>
${footerBlock}`,

  4: `<p>Dear {recipientName},</p>
<p>I realise I've been asking for a "yes" without painting a clear picture of what you're saying yes to. Let me address that.</p>
<p>Being a Pawsitive Protectors Ambassador means three things - and only as much as feels right to you:</p>
<p>1. Show your love - As an ambassador who believes in the cause<br>
2. Share - a post, a story, a moment from our drives with your network.<br>
3. Attend - a vaccination drive, once in a while, if you'd like to see the work firsthand.</p>
<p>That's it. We do not seek any commitments, just your willingness to drive meaningful change.</p>
<p>I'd love to walk you through it. Let me know.</p>
<p>Best regards,<br>
{senderName}</p>
${footerBlock}`,

  5: `<p>Dear {recipientName},</p>
<p>I won't keep showing up in your inbox - I know your time is genuinely valuable and I respect that.</p>
<p>I'll just say this: India's 2030 goal is real, and I would like you to play your part in it. The animals on the streets of this country are real. And the few people who choose to stand alongside - they matter more than they know.</p>
<p>If this ever feels like the right moment, we'll be here. You know where to find me.</p>
<p>Thank you for reading.</p>
<p>With warm regards,<br>
{senderName}</p>
${footerBlock}`,
};

const subjectLines = {
  1: 'Invitation to become a Pawsitive Protectors Ambassador',
  2: 'Following up: Pawsitive Protectors Ambassador invitation',
  3: 'A quick note on India\'s rabies-free 2030 goal',
  4: 'What being a Pawsitive Protectors Ambassador means',
  5: 'Final note from Pawsitive Protectors',
};

// Delete existing templates
await CampaignTemplate.deleteMany({ campaignName });

// Create new template
await CampaignTemplate.create({
  campaignName,
  templates,
  subjectLines,
});

console.log(`✅ Saved "${campaignName}" campaign templates to database`);
console.log(`   - 1 touchpoint 1 template`);
console.log(`   - 4 follow-up templates (touchpoints 2-5)`);
console.log(`   - 5 subject lines (one for each touchpoint)`);
console.log(``);
console.log(`Templates use placeholders:`);
console.log(`   {recipientName} - Will be replaced with actual recipient name (or removed if empty)`);
console.log(`   {senderName} - Will be replaced with sender's display name from config.json`);
console.log(``);

process.exit(0);

