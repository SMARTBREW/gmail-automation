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

const firstTouchTemplates = {
  1: `<p>Dear {recipientName},</p>
<p>Did you know that each year, <strong>23 million girls in India</strong> are forced to abandon their education simply because they lack access to basic menstrual hygiene products. This coupled by lack of awareness and prevailing taboos & restrictions is a <strong>FULL STOP</strong> to a girls right to education & equality.</p>
<p>Now, imagine a future where no girl is held back from learning because of her period. At the Joint Women's Programme (JWP), we believe this future is within reach, and with your help, we can make it happen.</p>
<p>As a passionate volunteer for the cause, I'd like to invite you on behalf of the <strong>Joint Women's Programme (JWP)</strong> to be an ambassador for the <strong>"Wings of Hope" campaign</strong>. Your voice will help us support school-going girls from underprivileged communities by providing them with <strong>sustainable, reusable cloth pads</strong> and provide essential <strong>menstrual and mental health counselling</strong>.</p>
<p>Your leadership and influence will play a crucial role in spreading awareness and inspiring collective action. With your support, we can reach more communities, keep more girls in school, and help them thrive.</p>
<p>Would you be open to a quick 5-minute call to explore how you could join as a Wings of Hope Ambassador?<br>
<br>
Sincere regards,<br>
<strong>{senderName}</strong><br>
Wings of Hope<br>
Joint Women's Programme<br>
<br>
<strong>About us</strong><br>
Established in 1977, Joint Women&#8203;'s Programme (JWP) is one of India's oldest national women's organisations, working for gender justice, social equity, and human rights. Through grassroots action and policy advocacy, JWP has empowered women and children across India and contributed to key reforms, including the Women's Reservation Act and Protection of Women from Domestic Violence Act.<br>
<br>
Recognised&#8203; by Hon'ble Former President Shri Ram Nath Kovind for our commitment to gender justice.<br>
Certifications&#8203;: 12A | 80G | NGO Darpan | CSR | FCRA | CAF approved<br>
<a href="https://jwpindia.org">jwpindia.org</a></p>`,
  '1a': `<p>Dear {recipientName},</p>
<p>Did you know that each year, <strong>23 million girls in India</strong> are forced to abandon their education simply because they lack access to basic menstrual hygiene products? The combination of stigma, taboos, and unaffordable supplies still halts a girl's progress overnight.</p>
<p>At the Joint Women's Programme (JWP), we’re showing that a different future is possible. Through <strong>Wings of Hope</strong>, we provide reusable cloth pads plus menstrual and mental health counselling so girls can stay in school.</p>
<p>I’m reaching out as a volunteer to invite you to join us as a Wings of Hope Ambassador. Your support would help us reach more under-resourced classrooms with dignity kits and open conversation.</p>
<p>Could we schedule a short 5-minute call to explore how you might lend your voice?<br>
<br>
Sincere regards,<br>
<strong>{senderName}</strong><br>
Wings of Hope<br>
Joint Women's Programme<br>
<br>
<strong>About us</strong><br>
Established in 1977, Joint Women&#8203;'s Programme (JWP) is one of India's oldest national women's organisations, working for gender justice, social equity, and human rights. Through grassroots action and policy advocacy, JWP has empowered women and children across India and contributed to key reforms, including the Women's Reservation Act and Protection of Women from Domestic Violence Act.<br>
<br>
Recognised&#8203; by Hon'ble Former President Shri Ram Nath Kovind for our commitment to gender justice.<br>
Certifications&#8203;: 12A | 80G | NGO Darpan | CSR | FCRA | CAF approved<br>
<a href="https://jwpindia.org">jwpindia.org</a></p>`,
  '1b': `<p>Dear {recipientName},</p>
<p>Did you know that each year, <strong>23 million girls in India</strong> are forced to abandon their education simply because they lack access to basic menstrual hygiene products? It’s a heartbreaking, preventable barrier rooted in misinformation and limited resources.</p>
<p>That’s why the Joint Women’s Programme (JWP) created <strong>Wings of Hope</strong>—a campaign that pairs reusable cloth pads with honest menstrual and mental health counselling.</p>
<p>I’d be honoured to have you consider becoming a Wings of Hope Ambassador. Your leadership can help us reach more girls who are on the brink of leaving school.</p>
<p>Would you be open to a quick 5-minute conversation to discuss this further?<br>
<br>
Sincere regards,<br>
<strong>{senderName}</strong><br>
Wings of Hope<br>
Joint Women's Programme<br>
<br>
<strong>About us</strong><br>
Established in 1977, Joint Women&#8203;'s Programme (JWP) is one of India's oldest national women's organisations, working for gender justice, social equity, and human rights. Through grassroots action and policy advocacy, JWP has empowered women and children across India and contributed to key reforms, including the Women's Reservation Act and Protection of Women from Domestic Violence Act.<br>
<br>
Recognised&#8203; by Hon'ble Former President Shri Ram Nath Kovind for our commitment to gender justice.<br>
Certifications&#8203;: 12A | 80G | NGO Darpan | CSR | FCRA | CAF approved<br>
<a href="https://jwpindia.org">jwpindia.org</a></p>`,
  '1c': `<p>Dear {recipientName},</p>
<p>Did you know that each year, <strong>23 million girls in India</strong> are forced to abandon their education simply because they lack access to basic menstrual hygiene products? The moment a period starts, many girls are told to stay home—and eventually they never return to school.</p>
<p>The Joint Women’s Programme (JWP) is working to change that through <strong>Wings of Hope</strong>: reusable cloth pad kits plus menstrual and mental wellbeing workshops in the schools that need them most.</p>
<p>As a volunteer, I’m inviting you to join as a Wings of Hope Ambassador. Your support would keep more desks filled and futures on track.</p>
<p>Could we chat for five minutes to explore how you might get involved?<br>
<br>
Sincere regards,<br>
<strong>{senderName}</strong><br>
Wings of Hope<br>
Joint Women's Programme<br>
<br>
<strong>About us</strong><br>
Established in 1977, Joint Women&#8203;'s Programme (JWP) is one of India's oldest national women's organisations, working for gender justice, social equity, and human rights. Through grassroots action and policy advocacy, JWP has empowered women and children across India and contributed to key reforms, including the Women's Reservation Act and Protection of Women from Domestic Violence Act.<br>
<br>
Recognised&#8203; by Hon'ble Former President Shri Ram Nath Kovind for our commitment to gender justice.<br>
Certifications&#8203;: 12A | 80G | NGO Darpan | CSR | FCRA | CAF approved<br>
<a href="https://jwpindia.org">jwpindia.org</a></p>`,
  '1d': `<p>Dear {recipientName},</p>
<p>Did you know that each year, <strong>23 million girls in India</strong> are forced to abandon their education simply because they lack access to basic menstrual hygiene products? It’s an invisible crisis that keeps far too many young women from reaching their full potential.</p>
<p>Our <strong>Wings of Hope</strong> campaign at the Joint Women's Programme (JWP) delivers reusable cloth pads along with menstrual and mental health counselling so girls can stay in school.</p>
<p>I’d love to invite you to serve as a Wings of Hope Ambassador. Your voice can help us bring dignity kits and safe conversations to more campuses.</p>
<p>Would you be open to a quick five-minute call to discuss the idea?<br>
<br>
Sincere regards,<br>
<strong>{senderName}</strong><br>
Wings of Hope<br>
Joint Women's Programme<br>
<br>
<strong>About us</strong><br>
Established in 1977, Joint Women&#8203;'s Programme (JWP) is one of India's oldest national women's organisations, working for gender justice, social equity, and human rights. Through grassroots action and policy advocacy, JWP has empowered women and children across India and contributed to key reforms, including the Women's Reservation Act and Protection of Women from Domestic Violence Act.<br>
<br>
Recognised&#8203; by Hon'ble Former President Shri Ram Nath Kovind for our commitment to gender justice.<br>
Certifications&#8203;: 12A | 80G | NGO Darpan | CSR | FCRA | CAF approved<br>
<a href="https://jwpindia.org">jwpindia.org</a></p>`,
  '1e': `<p>Dear {recipientName},</p>
<p>Did you know that each year, <strong>23 million girls in India</strong> are forced to abandon their education simply because they lack access to basic menstrual hygiene products? The combination of silence, stigma, and limited resources keeps derailing girls who want nothing more than to keep learning.</p>
<p>With <strong>Wings of Hope</strong>, the Joint Women’s Programme (JWP) is providing reusable cloth pads and supportive counselling in the very schools where dropouts are highest.</p>
<p>I’m asking if you’d consider becoming a Wings of Hope Ambassador. Your involvement could help an entire cohort of students stay in class.</p>
<p>Would you be available for a short five-minute conversation this week?<br>
<br>
Sincere regards,<br>
<strong>{senderName}</strong><br>
Wings of Hope<br>
Joint Women's Programme<br>
<br>
<strong>About us</strong><br>
Established in 1977, Joint Women&#8203;'s Programme (JWP) is one of India's oldest national women's organisations, working for gender justice, social equity, and human rights. Through grassroots action and policy advocacy, JWP has empowered women and children across India and contributed to key reforms, including the Women's Reservation Act and Protection of Women from Domestic Violence Act.<br>
<br>
Recognised&#8203; by Hon'ble Former President Shri Ram Nath Kovind for our commitment to gender justice.<br>
Certifications&#8203;: 12A | 80G | NGO Darpan | CSR | FCRA | CAF approved<br>
<a href="https://jwpindia.org">jwpindia.org</a></p>`,
  '1f': `<p>Dear {recipientName},</p>
<p>Did you know that each year, <strong>23 million girls in India</strong> are forced to abandon their education simply because they lack access to basic menstrual hygiene products? One period can set off a chain reaction of missed school days and ultimately a permanent dropout.</p>
<p>The Joint Women’s Programme’s <strong>Wings of Hope</strong> initiative equips girls with reusable cloth pads and mental health counselling so they can continue learning with confidence.</p>
<p>May I invite you to become a Wings of Hope Ambassador? Your leadership can open doors for the schools we partner with.</p>
<p>Let me know if we can grab a quick five-minute call to talk it through.<br>
<br>
Sincere regards,<br>
<strong>{senderName}</strong><br>
Wings of Hope<br>
Joint Women's Programme<br>
<br>
<strong>About us</strong><br>
Established in 1977, Joint Women&#8203;'s Programme (JWP) is one of India's oldest national women's organisations, working for gender justice, social equity, and human rights. Through grassroots action and policy advocacy, JWP has empowered women and children across India and contributed to key reforms, including the Women's Reservation Act and Protection of Women from Domestic Violence Act.<br>
<br>
Recognised&#8203; by Hon'ble Former President Shri Ram Nath Kovind for our commitment to gender justice.<br>
Certifications&#8203;: 12A | 80G | NGO Darpan | CSR | FCRA | CAF approved<br>
<a href="https://jwpindia.org">jwpindia.org</a></p>`,
  '1g': `<p>Dear {recipientName},</p>
<p>Did you know that each year, <strong>23 million girls in India</strong> are forced to abandon their education simply because they lack access to basic menstrual hygiene products? That translates to millions of lost dreams and futures every single year.</p>
<p>Our <strong>Wings of Hope</strong> campaign at the Joint Women’s Programme (JWP) is committed to reversing this trend by providing reusable cloth pads and stigma-free counselling directly in schools.</p>
<p>I’d love to have you on board as a Wings of Hope Ambassador. Together we can keep girls in classrooms where they belong.</p>
<p>Would you be open to a short five-minute chat to explore the idea?<br>
<br>
Sincere regards,<br>
<strong>{senderName}</strong><br>
Wings of Hope<br>
Joint Women's Programme<br>
<br>
<strong>About us</strong><br>
Established in 1977, Joint Women&#8203;'s Programme (JWP) is one of India's oldest national women's organisations, working for gender justice, social equity, and human rights. Through grassroots action and policy advocacy, JWP has empowered women and children across India and contributed to key reforms, including the Women's Reservation Act and Protection of Women from Domestic Violence Act.<br>
<br>
Recognised&#8203; by Hon'ble Former President Shri Ram Nath Kovind for our commitment to gender justice.<br>
Certifications&#8203;: 12A | 80G | NGO Darpan | CSR | FCRA | CAF approved<br>
<a href="https://jwpindia.org">jwpindia.org</a></p>`,
  '1h': `<p>Dear {recipientName},</p>
<p>Did you know that each year, <strong>23 million girls in India</strong> are forced to abandon their education simply because they lack access to basic menstrual hygiene products? It's an urgent issue that demands simple, compassionate solutions.</p>
<p>Through <strong>Wings of Hope</strong>, the Joint Women’s Programme (JWP) delivers reusable cloth pads and guided counselling so no girl has to sacrifice school when her period starts.</p>
<p>I’m volunteering on this campaign and would be grateful if you’d consider joining as a Wings of Hope Ambassador. Your leadership can inspire more communities to take action.</p>
<p>Can we find five minutes to talk about how you might help?<br>
<br>
Sincere regards,<br>
<strong>{senderName}</strong><br>
Wings of Hope<br>
Joint Women's Programme<br>
<br>
<strong>About us</strong><br>
Established in 1977, Joint Women&#8203;'s Programme (JWP) is one of India's oldest national women's organisations, working for gender justice, social equity, and human rights. Through grassroots action and policy advocacy, JWP has empowered women and children across India and contributed to key reforms, including the Women's Reservation Act and Protection of Women from Domestic Violence Act.<br>
<br>
Recognised&#8203; by Hon'ble Former President Shri Ram Nath Kovind for our commitment to gender justice.<br>
Certifications&#8203;: 12A | 80G | NGO Darpan | CSR | FCRA | CAF approved<br>
<a href="https://jwpindia.org">jwpindia.org</a></p>`
};

const firstTouchEntries = Object.fromEntries(
  Object.entries(firstTouchTemplates).map(([key, html]) => [key, html + footerImageHtml])
);

const templates = {
  ...firstTouchEntries,
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
  '1a': 'Keep girls in school: join Wings of Hope',
  '1b': 'Help us stop 23M girls from dropping out',
  '1c': 'Can we chat about Wings of Hope?',
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
