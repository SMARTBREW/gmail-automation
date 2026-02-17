import dotenv from 'dotenv';
dotenv.config();
import { connectMongo } from './src/db/mongo.js';
import { CampaignTemplate } from './src/models/CampaignTemplate.js';
await connectMongo();

const campaignName = 'Pads for Freedom';

const aboutUsBlock = `<p><strong>About KHUSHII:</strong><br>
KHUSHII (Kinship for Humanitarian Social and Holistic Intervention in India) is an independent, not-for-profit organization founded in 2003 by a group of dedicated philanthropists. With 21 years of on-ground experience, KHUSHII operates across 13 states in India, committed to driving positive change and ensuring that no child is left behind.<br>
Registration Number: S/47900/20034<br>
Unique Registration Number: AAATK6911AF20210<br>
FCRA Registration Number: 231660833<br>
Recognized by: Central Government, State Governments, Regulatory Bodies<br>
Website link: <a href="www.khushii.org">www.khushii.org</a><br>
Campaign page link: <a href="www.khushii.org/pads-for-freedom">www.khushii.org/pads-for-freedom</a><br>
Campaign Instagram link: <a href="www.instagram.com/pads4freedom">www.instagram.com/pads4freedom</a></p>`;

const templates = {
  // Touchpoint 1: Initial email
  1: `<p>Dear {recipientName},</p>
<p>Every year in India, nearly <strong>23 million girls</strong> drop out of school - not because they don't want to study, but because they don't have access to sanitary pads.</p>
<p>I read this some time ago, and it stopped me in my tracks.</p>
<p>I'm a volunteer with Pads for Freedom, a campaign working to ensure that a girl's education is never interrupted because of her period. We do this by providing safe, disposable, biodegradable sanitary pads, along with counselling sessions that replace shame with understanding.</p>
<p>I'm reaching out because people like you - thoughtful, respected, and influential in your own circles - can help change this quietly but powerfully.</p>
<p>Would you be open to exploring an inspiring role as a <strong>Pads for Freedom Cause Champion</strong>?</p>
<p>Warmly,<br>
<strong>{senderName}</strong><br>
Volunteer | Pads for Freedom<br>
KHUSHII NGO</p>
${aboutUsBlock}`,

  // Touchpoint 2: First follow-up
  2: `<p>Dear {recipientName},</p>
<p>I hope you're doing well.</p>
<p>I wanted to gently follow up on my previous note. Causes like Pads for Freedom grow not through noise, but through people who pause, reflect, and choose to care.</p>
<p>Being a <strong>Cause Champion</strong> doesn't require large commitments, it's simply lending your voice so <strong>the right conversations begin in the right places</strong>.</p>
<p>If this feels aligned, I'd love to share more whenever it's convenient for you.</p>
<p>Warm regards,<br>
<strong>{senderName}</strong><br>
Volunteer | Pads for Freedom<br>
KHUSHII NGO</p>`,

  // Touchpoint 3: Second follow-up
  3: `<p>Hi {recipientName},</p>
<p>One thing I've learned as a volunteer is this:</p>
<p><strong>The absence of a sanitary pad often brings absence from school</strong>, low confidence, and lost opportunities.</p>
<p>Pads for Freedom doesn't just distribute sanitary pads - we create <strong>safe spaces where girls can ask questions, understand their bodies, and feel normal</strong> about something entirely natural.</p>
<p>When someone becomes a <strong>Cause Champion</strong>, they help normalise these conversations - at home, at work, online, or among friends.</p>
<p>Would you be open to a short conversation to take it forward?</p>
<p>With warmth,<br>
<strong>{senderName}</strong><br>
Volunteer | Pads for Freedom<br>
KHUSHII NGO</p>`,

  // Touchpoint 4: Third follow-up
  4: `<p>Hello {recipientName},</p>
<p>I wanted to share a small but happy update from the ground.</p>
<p>Our team conducted a <strong>menstrual health counselling and pad distribution drive</strong> with schoolgirls - full of shy smiles, curious questions, and visible relief.</p>
<p>(I've attached a photo from the session - it captures the spirit far better than words.)</p>
<p>Support from <strong>Cause Champions</strong> makes moments like these possible.</p>
<p>If this small glimpse resonates with you, I'd love to have a brief conversation and share how moments like these become possible.</p>
<p>Warmly,<br>
<strong>{senderName}</strong><br>
Volunteer | Pads for Freedom<br>
KHUSHII NGO</p>`,

  // Touchpoint 5: Fourth follow-up
  5: `<p>Dear {recipientName},</p>
<p>Being a <strong>Pads for Freedom Cause Champion</strong> could be as simple as:</p>
<p>• <strong>Sharing your views</strong> on the problem within your network<br>
• Supporting the cause with a fundraiser <strong>without any financial liability</strong><br>
• Helping more people understand why <strong>menstrual dignity matters</strong></p>
<p>There's nothing more required - just authenticity and belief.</p>
<p>If this aligns with how you like to support Pads for Freedom, perhaps we could talk briefly about what that could look like.</p>
<p>Best,<br>
<strong>{senderName}</strong><br>
Volunteer | Pads for Freedom<br>
KHUSHII NGO</p>`,

  // Touchpoint 6: Fifth follow-up
  6: `<p>Dear {recipientName},</p>
<p>I hope you've been well.</p>
<p>I wanted to reach out one last time before I pause - simply to say thank you for taking the time to read my messages. I know how full inboxes and days can be.</p>
<p>If Pads for Freedom is something you'd like to explore further, even briefly, I'd really value hearing from you. And if <strong>now isn't the right moment</strong>, that's completely understandable too.</p>
<p>Either way, I'm grateful for your <strong>openness and the space</strong> you've given this cause.</p>
<p>Warm wishes,<br>
<strong>{senderName}</strong><br>
Volunteer | Pads for Freedom<br>
KHUSHII NGO</p>`,

  // Touchpoint 7: Final follow-up
  7: `<p>Dear {recipientName},</p>
<p>Thank you once again for the time and attention you've given to these notes.</p>
<p>I'll step back after this, but I wanted you to know that <strong>the invitation remains open</strong>. If at any point you'd like to support girls staying in school through Pads for Freedom - whether as a <strong>Cause Champion</strong> or simply as a <strong>well-wisher</strong> - I'd be very happy to reconnect.</p>
<p>Until then, thank you for your openness, and for the work you already do to make the world a little more equitable.</p>
<p>With warm regards,<br>
<strong>{senderName}</strong><br>
Volunteer | Pads for Freedom<br>
KHUSHII NGO</p>`,
};

const subjectLines = {
  1: '23 million girls. One preventable reason.',
  2: 'Re: 23 million girls. One preventable reason.',
  3: 'Re: 23 million girls. One preventable reason.',
  4: 'Re: 23 million girls. One preventable reason.',
  5: 'Re: 23 million girls. One preventable reason.',
  6: 'Re: 23 million girls. One preventable reason.',
  7: 'Re: 23 million girls. One preventable reason.',
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
console.log(`   - 7 touchpoint templates`);
console.log(`   - 7 subject lines (one for each touchpoint)`);
console.log(``);
console.log(`Templates use placeholders:`);
console.log(`   {recipientName} - Will be replaced with actual recipient name (or removed if empty)`);
console.log(`   {senderName} - Will be replaced with sender's display name from config.json`);
console.log(``);

process.exit(0);
