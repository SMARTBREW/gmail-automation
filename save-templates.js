import dotenv from 'dotenv';
dotenv.config();
import { connectMongo } from './src/db/mongo.js';
import { CampaignTemplate } from './src/models/CampaignTemplate.js';
await connectMongo();

const campaignName = 'Wings of Hope';

const baseSubject = 'Short note about something I volunteer for';

const templates = {
  1: `<p>Hi {recipientName},</p>
<p>I volunteer with Joint Women's Programme, an NGO that's worked on women's rights in India since 1977. I'm writing about our Wings of Hope campaign and wondered if you'd be open to hearing more.</p>
<p>The problem: an estimated 23 million girls in India drop out of school each year once they start menstruating - no pads, no information, a lot of shame. That's the equivalent of a classroom of 40 girls, every minute.</p>
<p>Wings of Hope have been in government schools across Delhi, Haryana, UP, Uttarakhand, Jharkhand, Telangana, and Karnataka. We provide reusable cloth pads, menstrual health education, and counselling, so girls stay in class.</p>
<p>I'm reaching out because I'd love for you to join as a Wings of Hope Ambassador - someone lending their voice to help more girls stay in school.</p>
<p>If any of this resonates, even a short "tell me more" would mean a lot. Happy to jump on a call whenever it works.</p>
<p>Warmly,<br>
{senderName}<br>
Wings of Hope | Joint Women's Programme<br>
Giving Circle Volunteer</p>`,

  2: `<p>Hi {recipientName},</p>
<p>Just floating this back up in case it got buried - I know inboxes fill up fast.</p>
<p>No pressure, just didn't want my earlier note to slip by unseen.</p>
<p>Warmly,<br>
{senderName}<br>
Wings of Hope | Joint Women's Programme<br>
Giving Circle Volunteer</p>`,

  3: `<p>Hi {recipientName},</p>
<p>In case you've been wondering what being a Wings of Hope Ambassador really means - do you need to commit time, money, or carry any liability?</p>
<p>The answer is no.</p>
<p>Here's the full picture: you pick a goal that feels right ("support 25 girls this year"), send us a photo you're happy with, and we build you a personalised poster and a payment link in your name. You share it when it feels natural - a family WhatsApp, an Instagram story, a dinner conversation.</p>
<p>Donors, thank-yous, 80G certificates, impact updates - we handle all of it.</p>
<p>That's the simplest version. If you want to do more, we're all ears.</p>
<p>Does this sound like something you'd be up for?</p>
<p>Warmly,<br>
{senderName}<br>
Wings of Hope | Joint Women's Programme<br>
Giving Circle Volunteer</p>`,

  4: `<p>Hi {recipientName},</p>
<p>A quick update in case it's useful context.</p>
<p>Last month our team ran pad-kit distribution and workshops across three government schools in Telangana, reaching 350 girls. Teachers have told us attendance among the older girls has visibly improved since the sessions started - encouraging, even if it's early days.</p>
<p>Small wins, but the kind that keeps us going.</p>
<p>If joining as a Wings of Hope Ambassador feels right, we'd love to have you help us reach more girls.</p>
<p>Warmly,<br>
{senderName}<br>
Wings of Hope | Joint Women's Programme<br>
Giving Circle Volunteer</p>`,

  5: `<p>Hi {recipientName},</p>
<p>Last note from me - genuinely no pressure.</p>
<p>I just didn't want to step away without saying thank you for the time you gave these emails.</p>
<p>If you ever want to come back to this - as an Ambassador, a donor, or a quiet well-wisher - my inbox stays open. You can also follow along at <a href="https://www.instagram.com/wingsofhope.india/">@wingsofhope.india</a>.</p>
<p>Wishing you well,<br>
{senderName}<br>
Wings of Hope | Joint Women's Programme<br>
Giving Circle Volunteer</p>`,
};

const subjectLines = {
  1: baseSubject,
  2: baseSubject,
  3: baseSubject,
  4: baseSubject,
  5: baseSubject,
};

await CampaignTemplate.deleteMany({ campaignName });

await CampaignTemplate.create({
  campaignName,
  templates,
  subjectLines,
});

console.log(`✅ Saved "${campaignName}" campaign templates to database`);
console.log(`   - 5 touchpoint templates (1 initial + follow-ups 2-5)`);
console.log(`   - Subject (touchpoint 1): "${baseSubject}"`);
console.log(`   - Follow-up subjects use Re: + original first-email subject (enqueue-followups.js)`);
console.log(``);
console.log(`Templates use placeholders:`);
console.log(`   {recipientName} - recipient name`);
console.log(`   {senderName} - sender display name from config.json`);
console.log(``);

process.exit(0);
