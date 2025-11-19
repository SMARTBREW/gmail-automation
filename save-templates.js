import dotenv from 'dotenv';
dotenv.config();
import { connectMongo } from './src/db/mongo.js';
import { CampaignTemplate } from './src/models/CampaignTemplate.js';
import { readFileSync, existsSync } from 'fs';
import path from 'path';

await connectMongo();

const campaignName = 'Wings of Hope';

// Optional image footer for first email (embedded as base64)
let footerImageHtml = '';
try {
  const imgPath = path.resolve(process.cwd(), 'public', 'WoH 2.png');
  if (existsSync(imgPath)) {
    const b64 = readFileSync(imgPath).toString('base64');
    footerImageHtml =
      `<p style="margin:0;padding:0">` +
      `<img src="data:image/png;base64,${b64}" alt="Wings of Hope" ` +
      `style="max-width:600px;width:100%;height:auto;display:block;border:0;outline:none;text-decoration:none"/></p>`;
  }
} catch {}

const FACTS_LINE = 'Did you know that each year, <strong>23 million girls in India</strong> are forced to abandon their education simply because they lack access to basic menstrual hygiene products. This coupled by lack of awareness and prevailing taboos & restrictions is a <strong>FULL STOP</strong> to a girl\'s right to education & equality.';

const aboutUsBlock = `<p><strong>About us</strong><br>
Established in 1977, Joint Women&#8203;'s Programme (JWP) is one of India's oldest national women's organisations, working for gender justice, social equity, and human rights. Through grassroots action and policy advocacy, JWP has empowered women and children across India and contributed to key reforms, including the Women's Reservation Act and Protection of Women from Domestic Violence Act.<br>
<br>
Recognised&#8203; by Hon'ble Former President Shri Ram Nath Kovind for our commitment to gender justice.<br>
Certifications&#8203;: 12A | 80G | NGO Darpan | CSR | FCRA | CAF approved<br>
<a href="https://jwpindia.org">jwpindia.org</a></p>`;

function makeFirstTouch({ futureLine, inviteLine, impactLine, ctaLine }) {
  return (
    `<p>Dear {recipientName},</p>
<p>${FACTS_LINE}</p>
<p>${futureLine}</p>
<p>${inviteLine}</p>
<p>${impactLine}</p>
<p>${ctaLine}<br>
<br>
Sincere regards,<br>
<strong>{senderName}</strong><br>
Wings of Hope<br>
Joint Women's Programme</p>` +
    aboutUsBlock +
    footerImageHtml
  );
}

const firstTouchTemplates = {
  1: makeFirstTouch({
    futureLine:
      'Now, imagine a future where no girl is held back from learning because of her period. At the Joint Women\'s Programme (JWP), we believe this future is within reach, and with your help, we can make it happen.',
    inviteLine:
      'As a passionate volunteer for the cause, I\'d like to invite you on behalf of the <strong>Joint Women\'s Programme (JWP)</strong> to be an ambassador for the <strong>"Wings of Hope" campaign</strong>. Your voice will help us support school-going girls from underprivileged communities by providing them with <strong>sustainable, reusable cloth pads</strong> and essential <strong>menstrual and mental health counselling</strong>.',
    impactLine:
      'Your leadership and influence will play a crucial role in spreading awareness and inspiring collective action. With your support, we can reach more communities, keep more girls in school, and help them thrive.',
    ctaLine: 'Would you be open to a quick 5-minute call to explore how you could join as a Wings of Hope Ambassador?'
  }),
  '1a': makeFirstTouch({
    futureLine:
      'Now, imagine never having to tell a bright student to miss class because of her period—we believe that reality is possible and we\'re building it every day at JWP.',
    inviteLine:
      'On behalf of the <strong>Joint Women’s Programme</strong>, I’d love for you to step in as a <strong>Wings of Hope Ambassador</strong> so we can equip school-going girls with <strong>reusable cloth pads</strong> plus <strong>trusted menstrual and mental health counselling</strong>.',
    impactLine:
      'Your leadership can accelerate awareness, unlock new communities, and keep more girls engaged in their studies.',
    ctaLine: 'Could we schedule a quick 5-minute chat to see how you might lend your voice?'
  }),
  '1b': makeFirstTouch({
    futureLine:
      'Now imagine a school day where periods never dictate who gets to learn—that’s the future we’re chasing with Wings of Hope.',
    inviteLine:
      'I’m reaching out from <strong>Joint Women’s Programme</strong> to invite you to champion <strong>"Wings of Hope"</strong>, where we pair <strong>reusable pad kits</strong> with open, stigma-free mentoring on menstrual and mental wellbeing.',
    impactLine:
      'With allies like you, we can reach more campuses, replace silence with knowledge, and keep promising students on track.',
    ctaLine: 'May I request five minutes of your time to explore what this partnership could look like?'
  }),
  '1c': makeFirstTouch({
    futureLine:
      'Picture a classroom where every girl sits confidently through exams, regardless of her cycle—that vision is what drives us at JWP.',
    inviteLine:
      'As a volunteer, I’d be honoured if you’d become a <strong>Wings of Hope Ambassador</strong> so we can continue delivering <strong>sustainable cloth pads</strong> and empathetic counselling where dropout risk is highest.',
    impactLine:
      'Your support can keep desks filled, dreams intact, and conversations about menstrual health honest and hopeful.',
    ctaLine: 'If this resonates, could we hop on a five-minute call to discuss next steps?'
  }),
  '1d': makeFirstTouch({
    futureLine:
      'Imagine a future in which every period is met with dignity, not a disrupted education—that’s the reality we’re working toward.',
    inviteLine:
      'Through <strong>"Wings of Hope"</strong>, JWP provides <strong>reusable cloth pads</strong> alongside practical menstrual and mental health guidance, and we’d be grateful to have you as an ambassador.',
    impactLine:
      'Your leadership can spark collective action, expanding our reach into new classrooms and communities.',
    ctaLine: 'Would you be open to a five-minute conversation to explore supporting the campaign?'
  }),
  '1e': makeFirstTouch({
    futureLine:
      'Now, envision a world where girls never have to pause their ambitions because of a natural cycle—together we can build it.',
    inviteLine:
      'By joining <strong>Wings of Hope</strong> as an ambassador, you’ll help us deliver <strong>sustainable pad kits</strong> and compassionate menstrual & mental health workshops to the students who need them most.',
    impactLine:
      'With your encouragement, we can reach more districts, normalize health conversations, and keep girls focused on learning.',
    ctaLine: 'Can we find five minutes to talk about how you might get involved?'
  }),
  '1f': makeFirstTouch({
    futureLine:
      'We can already see a horizon where periods never derail a promising academic year—and your voice could bring it closer.',
    inviteLine:
      'I’m inviting you to become a <strong>Wings of Hope Ambassador</strong> so we can keep providing <strong>reusable pad kits</strong> plus confidence-building counselling to girls on the brink of dropping out.',
    impactLine:
      'Your support will help us scale the initiative, protect learning time, and keep futures on track.',
    ctaLine: 'Let me know if we can connect for five minutes to explore the fit.'
  }),
  '1g': makeFirstTouch({
    futureLine:
      'Now imagine every girl finishing school with her head held high, unbothered by stigma or scarcity—that’s the future we’re inviting you to shape.',
    inviteLine:
      'As an ambassador with <strong>Wings of Hope</strong>, you’d help us deliver <strong>reusable cloth pads</strong> plus stigma-busting mentoring inside the very classrooms where support is missing.',
    impactLine:
      'Your leadership can open doors, inspire allies, and ensure girls stay exactly where they belong—in school.',
    ctaLine: 'Would you have five minutes for a quick call to explore the role?'
  }),
  '1h': makeFirstTouch({
    futureLine:
      'We know a world is possible where periods are treated like any other health topic—and girls never sacrifice education because of them.',
    inviteLine:
      'Joining <strong>Wings of Hope</strong> as an ambassador means helping us equip communities with <strong>reusable pads</strong> and thoughtful menstrual & mental health support.',
    impactLine:
      'Your voice can help us reach more schools, inspire collective action, and keep more girls thriving academically.',
    ctaLine: 'Could we connect for a quick five-minute chat to see how you might help?'
  }),
  '1i': makeFirstTouch({
    futureLine:
      'Imagine every girl moving through school with confidence, regardless of her cycle—that belief sits at the heart of Wings of Hope.',
    inviteLine:
      'I’m reaching out via the <strong>Joint Women’s Programme</strong> to ask if you’d join as a <strong>Wings of Hope Ambassador</strong>. Together we deliver <strong>sustainable pad kits</strong> and open, empowering counselling.',
    impactLine:
      'Your leadership can keep this work expanding so more girls stay in classrooms, graduate, and lead.',
    ctaLine: 'Would you be open to a short 5-minute call to discuss how you might champion the campaign?'
  }),
};

const templates = {
  ...firstTouchTemplates,
  // Touchpoint 2: First followup email
  2: `<p>Dear {recipientName},</p>
<p>I hope this message finds you well. Just checking in to see if you had a chance to look at my previous note on the <strong>"Wings of Hope" initiative</strong> by the Joint Women's Programme (JWP).</p>
<p>As volunteers, we are passionate about combating <strong>period poverty</strong>, a challenge that forces <strong>23 million girls in India</strong> to drop out of school each year.</p>
<p>Your willingness to support us as a <strong>"Wings of Hope Ambassador"</strong> will help us reach more girls to provide <strong>sustainable, reusable cloth pads</strong> and <strong>menstrual & mental health counselling</strong> to underprivileged schoolgirls.</p>
<p>Even a brief chat or a message of support would mean a lot.<br>
<br>
With Hope & Gratitude,<br>
<strong>{senderName}</strong><br>
Wings of Hope<br>
Joint Women's Programme</p>
<p style="margin:0;padding:0"><strong>About us</strong><br>
Established in 1977, Joint Women's Programme (JWP) is one of India's oldest national women's organisations, working for gender justice, social equity, and human rights. Through grassroots action and policy advocacy, JWP has empowered women and children across India and contributed to key reforms, including the Women's Reservation Act and Protection of Women from Domestic Violence Act.<br>
<br>
Recognised by Hon'ble Former President Shri Ram Nath Kovind for our commitment to gender justice.<br>
Certifications: 12A | 80G | NGO Darpan | CSR | FCRA | CAF approved<br>
<a href="https://jwpindia.org">jwpindia.org</a></p>`,

  // Touchpoint 3: Second followup email
  3: `<p>Dear {recipientName},</p>
<p>I know you're busy, but I didn't want you to miss this opportunity to help girls stay in school.</p>
<p>Every day, more girls miss out on education due to lack of menstrual hygiene resources and awareness. At JWP, we believe no girl should have to choose between her dignity and her education.</p>
<p>Your voice and influence could help us reach thousands more girls and inspire communities to take action. Even a short conversation could make a big difference.</p>
<p>Looking forward to hearing back from you.<br>
<br>
With Hope & Gratitude,<br>
<strong>{senderName}</strong><br>
Wings of Hope<br>
Joint Women's Programme</p>
<p style="margin:0;padding:0"><strong>About us</strong><br>
Established in 1977, Joint Women's Programme (JWP) is one of India's oldest national women's organisations, working for gender justice, social equity, and human rights. Through grassroots action and policy advocacy, JWP has empowered women and children across India and contributed to key reforms, including the Women's Reservation Act and Protection of Women from Domestic Violence Act.<br>
<br>
Recognised by Hon'ble Former President Shri Ram Nath Kovind for our commitment to gender justice.<br>
Certifications: 12A | 80G | NGO Darpan | CSR | FCRA | CAF approved<br>
<a href="https://jwpindia.org">jwpindia.org</a></p>`,

  // Touchpoint 4: Third followup email
  4: `<p>Dear {recipientName},</p>
<p>Greetings of the day! Did you know that <strong>ONLY 1 out of 100 girls in rural India</strong> manage to reach class XII. <strong>Period poverty</strong> contributes in a huge way to this grim reality.</p>
<p>I was shocked when I learnt that, inspiring me to take action and support girls to stay in school, complete their education and have a fair shot at a respectable career and financial independence.</p>
<p>We can't do this without partners like you and hence my persistence.</p>
<p>A quick yes from you will help us bring dignity to another classroom of girls.<br>
<br>
With Hope & Gratitude,<br>
<strong>{senderName}</strong><br>
Wings of Hope<br>
Joint Women's Programme</p>
<p style="margin:0;padding:0"><strong>About us</strong><br>
Established in 1977, Joint Women's Programme (JWP) is one of India's oldest national women's organisations, working for gender justice, social equity, and human rights. Through grassroots action and policy advocacy, JWP has empowered women and children across India and contributed to key reforms, including the Women's Reservation Act and Protection of Women from Domestic Violence Act.<br>
<br>
Recognised by Hon'ble Former President Shri Ram Nath Kovind for our commitment to gender justice.<br>
Certifications: 12A | 80G | NGO Darpan | CSR | FCRA | CAF approved<br>
<a href="https://jwpindia.org">jwpindia.org</a></p>`,

  // Touchpoint 5: Fourth followup email
  5: `<p>Dear {recipientName},</p>
<p>I have a happy update to share. With support from noble Wings of Hope Ambassadors, we have managed to reach underprivileged girls in <strong>Delhi, Haryana, Uttar Pradesh, Uttarakhand, Jharkhand</strong> already and plan to reach the villages, urban slums, and communities who have no access to knowledge or hygienic sanitary supplies.</p>
<p>The response has been truly inspiring! Your involvement could help us expand this impact to many more states.</p>
<p>Together, we can expand this movement and make period poverty a thing of the past.</p>
<p>A YES from you will be a huge support.<br>
<br>
With Hope & Gratitude,<br>
<strong>{senderName}</strong><br>
Wings of Hope<br>
Joint Women's Programme</p>
<p style="margin:0;padding:0"><strong>About us</strong><br>
Established in 1977, Joint Women's Programme (JWP) is one of India's oldest national women's organisations, working for gender justice, social equity, and human rights. Through grassroots action and policy advocacy, JWP has empowered women and children across India and contributed to key reforms, including the Women's Reservation Act and Protection of Women from Domestic Violence Act.<br>
<br>
Recognised by Hon'ble Former President Shri Ram Nath Kovind for our commitment to gender justice.<br>
Certifications: 12A | 80G | NGO Darpan | CSR | FCRA | CAF approved<br>
<a href="https://jwpindia.org">jwpindia.org</a></p>`,

  // Touchpoint 6: Fifth followup email
  6: `<p>Dear {recipientName},</p>
<p>I hope you are doing well.</p>
<p>Thank you for staying with me through these messages, it means a lot. Your support can help ensure that no girl drops out of school because of her period, and I believe this cause will resonate with your heart.</p>
<p>I completely understand how busy schedules can get, but even a quick reply saying "interested" or "tell me more" would mean the world to us.<br>
<br>
With Hope & Gratitude,<br>
<strong>{senderName}</strong><br>
Wings of Hope<br>
Joint Women's Programme</p>
<p style="margin:0;padding:0"><strong>About us</strong><br>
Established in 1977, Joint Women's Programme (JWP) is one of India's oldest national women's organisations, working for gender justice, social equity, and human rights. Through grassroots action and policy advocacy, JWP has empowered women and children across India and contributed to key reforms, including the Women's Reservation Act and Protection of Women from Domestic Violence Act.<br>
<br>
Recognised by Hon'ble Former President Shri Ram Nath Kovind for our commitment to gender justice.<br>
Certifications: 12A | 80G | NGO Darpan | CSR | FCRA | CAF approved<br>
<a href="https://jwpindia.org">jwpindia.org</a></p>`,

  // Touchpoint 7: Last followup email
  7: `<p>Dear {recipientName},</p>
<p>I completely understand that schedules can be busy, so I'll keep this brief. I truly appreciate your time and attention over the past few weeks regarding the <strong>"Wings of Hope" initiative</strong>.</p>
<p>Should you wish to join hands in empowering girls and ending period poverty, my inbox will always be open. Even a small contribution of time, expertise, or creating awareness can make a lasting difference.</p>
<p>You can also follow our work at <a href="https://instagram.com/wingsofhope.india">instagram.com/wingsofhope.india</a> or visit <a href="https://jwpindia.org">jwpindia.org</a> to see how we're changing lives.<br>
<br>
Best regards,<br>
<strong>{senderName}</strong><br>
Wings of Hope<br>
Joint Women's Programme</p>
<p style="margin:0;padding:0"><strong>About us</strong><br>
Established in 1977, Joint Women's Programme (JWP) is one of India's oldest national women's organisations, working for gender justice, social equity, and human rights. Through grassroots action and policy advocacy, JWP has empowered women and children across India and contributed to key reforms, including the Women's Reservation Act and Protection of Women from Domestic Violence Act.<br>
<br>
Recognised by Hon'ble Former President Shri Ram Nath Kovind for our commitment to gender justice.<br>
Certifications: 12A | 80G | NGO Darpan | CSR | FCRA | CAF approved<br>
<a href="https://jwpindia.org">jwpindia.org</a></p>`,
};

const subjectLines = {
  1: 'Be a Voice for Change: Join Wings of Hope',
  '1a': 'Keep girls in school with Wings of Hope',
  '1b': 'Help us stop 23M girls from dropping out',
  '1c': 'Can we chat about Wings of Hope?',
  '1d': 'Your leadership can empower schoolgirls',
  '1e': 'Stand with girls facing period poverty',
  '1f': 'A quick way to support Wings of Hope',
  '1g': 'Join our mission to end period poverty',
  '1h': 'Let’s keep girls learning together',
  '1i': 'Five minutes to champion Wings of Hope',
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
console.log(`   - 7 email templates (touchpoints 1-7)`);
console.log(`   - 1 subject line for initial email`);
console.log(``);
console.log(`Templates use placeholders:`);
console.log(`   {recipientName} - Will be replaced with actual recipient name (or removed if empty)`);
console.log(`   {senderName} - Will be replaced with sender's display name from config.json`);
console.log(``);

process.exit(0);
