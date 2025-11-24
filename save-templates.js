import dotenv from 'dotenv';
dotenv.config();
import { connectMongo } from './src/db/mongo.js';
import { CampaignTemplate } from './src/models/CampaignTemplate.js';
await connectMongo();

const campaignName = 'Wings of Hope';

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
    aboutUsBlock
  );
}

// Helper function to create variant with custom facts line
function makeFirstTouchVariant({ factsLine, futureLine = '', inviteLine, impactLine, ctaLine }) {
  const futureParagraph = futureLine ? `<p>${futureLine}</p>` : '';
  return (
    `<p>Dear {recipientName},</p>
<p>${factsLine}</p>
${futureParagraph}
<p>${inviteLine}</p>
<p>${impactLine}</p>
<p>${ctaLine}<br>
<br>
Sincere regards,<br>
<strong>{senderName}</strong><br>
Wings of Hope<br>
Joint Women's Programme</p>` +
    aboutUsBlock
  );
}

const firstTouchTemplates = {
  1: makeFirstTouchVariant({
    factsLine: `Did you know that each year, <strong>23 million girls in India</strong> are forced to abandon their education simply because they lack access to basic menstrual hygiene products. This coupled by lack of awareness and prevailing taboos & restrictions is a <strong>FULL STOP</strong> to a girl's right to education & equality.`,
    futureLine: `Now, imagine a future where no girl is held back from learning because of her period. At the Joint Women's Programme (JWP), we believe this future is within reach, and with your help, we can make it happen.`,
    inviteLine: `As a passionate volunteer for the cause, I'd like to invite you on behalf of the <strong>Joint Women's Programme (JWP)</strong> to be an ambassador for the <strong>"Wings of Hope" campaign</strong>. Your voice will help us support school-going girls from underprivileged communities by providing them with <strong>sustainable, reusable cloth pads</strong> and essential <strong>menstrual and mental health counselling</strong>.`,
    impactLine: `Your leadership and influence will play a crucial role in spreading awareness and inspiring collective action. With your support, we can reach more communities, keep more girls in school, and help them thrive.`,
    ctaLine: `Would you be open to a quick 5-minute call to explore how you could join as a Wings of Hope Ambassador?`
  }),
  '1a': makeFirstTouchVariant({
    factsLine: `Did you know that each year, <strong>23 million girls in India</strong> are forced to abandon their education simply because they lack access to basic menstrual hygiene products. This coupled by lack of awareness and prevailing taboos & restrictions is a <strong>FULL STOP</strong> to a girl's right to education & equality.`,
    futureLine: `Picture a morning assembly where every student shows up confident instead of worrying about basic supplies, that steady calm is what Wings of Hope works toward daily.`,
    inviteLine: `As volunteers with the <strong>Joint Women's Programme</strong>, we would love you to stand in as a <strong>Wings of Hope Ambassador</strong> so we can stock classrooms with <strong>reusable cloth pads</strong> plus <strong>trusted menstrual and mental health mentors</strong>.`,
    impactLine: `Your voice helps open school doors faster, keeps conversations respectful, and makes it easier for girls to keep notebooks, not excuses, in their bags.`,
    ctaLine: `Would you have five minutes this week for a quick call to see how your voice could anchor the cause?`
  }),
  '1b': makeFirstTouchVariant({
    factsLine: `Did you know that each year, <strong>23 million girls in India</strong> are forced to abandon their education simply because they lack access to basic menstrual hygiene products. This coupled by lack of awareness and prevailing taboos & restrictions puts a <strong>PERIOD</strong> to girl's right to education & equality.`,
    futureLine: `Imagine a science lab where curiosity, not stigma, drives questions, that is the picture students describe to us when they finally have the resources they need.`,
    inviteLine: `I am reaching out from the <strong>Joint Women's Programme</strong> to invite you to champion <strong>"Wings of Hope"</strong>, pairing <strong>reusable pad kits</strong> with safe circles for menstrual and mental wellbeing.`,
    impactLine: `Supporters like you turn whispered worries into open dialogue, helping us keep promising scholars steady through exams and internships alike.`,
    ctaLine: `Could we find a quick five-minute slot to outline what partnering with you might unlock?`
  }),
  '1c': makeFirstTouchVariant({
    factsLine: `Did you know that each year, <strong>23 million girls in India</strong> are forced to abandon their education simply because they lack access to basic menstrual hygiene products. This coupled by lack of awareness and prevailing taboos & restrictions is a <strong>FULL STOP</strong> to a girl's right to education & equality.`,
    futureLine: `Think of examination halls where attendance sheets no longer dip midweek, that steady participation is what keeps us motivated at JWP.`,
    inviteLine: `As a fellow volunteer, I'd be honoured if you'd step in as a <strong>Wings of Hope Ambassador</strong> so we can continue delivering <strong>sustainable cloth pads</strong> plus empathetic counselling to the girls closest to dropping out.`,
    impactLine: `Your support keeps desks filled, protects unbroken study schedules, and signals to communities that menstrual health deserves honest conversation.`,
    ctaLine: `If that aligns with you, could we hop on a brief five-minute call to map the next step?`
  }),
  '1d': makeFirstTouchVariant({
    factsLine: `Did you know that a classroom of girls (ie. <strong>40 girls</strong>) in India are forced to abandon their education every minute simply because they lack access to basic menstrual hygiene products. This coupled by lack of awareness and prevailing taboos & restrictions are putting <strong>AN END</strong> to a girl's right to education & equality.`,
    futureLine: `Envision a future where periods are treated like any other health topic at parent-teacher meetings, that's the culture shift Wings of Hope pushes for.`,
    inviteLine: `Through <strong>"Wings of Hope"</strong>, JWP delivers <strong>reusable cloth pads</strong> alongside practical menstrual and mental health coaching, and we would value your presence as an ambassador.`,
    impactLine: `Your leadership sparks local champions, helping us expand into classrooms that have never hosted conversations like these.`,
    ctaLine: `Would you be open to a focused five-minute chat to explore how you might guide the campaign?`
  }),
  '1e': makeFirstTouchVariant({
    factsLine: `Did you know that each year, <strong>23 million girls in India</strong> are forced to abandon their education simply because she has been told to stay at home and not venture outside on her period days. This coupled with lack of awareness and prevailing taboos & restrictions is a <strong>FULL STOP</strong> to a girl's right to education & equality.`,
    futureLine: `Now, imagine a world where internship interviews and board exams are never skipped for lack of supplies, together we can lock that reality in place.`,
    inviteLine: `By joining <strong>Wings of Hope</strong> as an ambassador, you'll help us deliver <strong>sustainable pad kits</strong> and compassionate menstrual & mental health workshops exactly where dropout risk spikes.`,
    impactLine: `With your encouragement, new districts open their doors, conversations stay respectful, and students get to obsess over assignments, not scarcity.`,
    ctaLine: `Can we schedule a five-minute conversation to see how you might plug in?`
  }),
  '1f': makeFirstTouchVariant({
    factsLine: `Did you know that each year, <strong>millions of girls in India</strong> are forced to abandon their education simply because they lack access to basic menstrual hygiene products. Basically every year for <strong>23 million girls</strong> the right to education, equality, dreams of a better future comes to a grinding <strong>STOP</strong>!`,
    futureLine: `We already see glimpses of semesters where attendance lines stay steady all year, and your voice could make that the norm rather than the exception.`,
    inviteLine: `I'm inviting you to become a <strong>Wings of Hope Ambassador</strong> so we can keep supplying <strong>reusable pad kits</strong> plus confidence-building counselling to students standing on the edge of leaving school.`,
    impactLine: `Your backing helps us scale quietly and responsibly, protecting study time and letting futures stay on track.`,
    ctaLine: `Let me know if we can connect for five minutes to explore whether this aligns with you.`
  }),
  '1g': makeFirstTouchVariant({
    factsLine: `Right now, as you read this sentence, <strong>three girls just dropped out of school in India</strong>. The reason? They started menstruating. What if I told you that something as natural as a period is forcing <strong>23 million Indian girls</strong> to abandon their dreams every single year?`,
    futureLine: `Now imagine graduation days filled with students who never had to disappear midterm because of stigma, that is the finish line we're steering toward.`,
    inviteLine: `As an ambassador with <strong>Wings of Hope</strong>, you'd help us deliver <strong>reusable cloth pads</strong> plus stigma-busting mentoring in the classrooms that have waited longest.`,
    impactLine: `Your leadership opens doors, inspires local allies, and keeps girls exactly where they belong, in school and in leadership roles.`,
    ctaLine: `Would you have five minutes for a quick call to see if this role suits you?`
  }),
  '1h': makeFirstTouchVariant({
    factsLine: `Imagine losing your right to education at age 12 - not because of war, poverty, or disaster, but because of your period. <strong>23 million a year!</strong> That's not just a statistic - it's an entire generation of girls whose education ends the moment they begin menstruating.`,
    futureLine: `We know a world is possible where with free reusable cloth pads and counselling no girl feels the need to step back from learning.`,
    inviteLine: `Joining <strong>Wings of Hope</strong> as an ambassador means helping us equip communities with <strong>reusable pads</strong> and thoughtful menstrual & mental health support that teachers can rely on.`,
    impactLine: `Your voice helps us reach more schools, inspires collective action, and keeps more girls thriving academically and emotionally.`,
    ctaLine: `Could we connect for a five-minute chat to explore how you'd like to help?`
  }),
  '1i': makeFirstTouchVariant({
    factsLine: `In the time it takes you to read this email, <strong>120 girls in India will drop out of school</strong> because they lack access to menstrual hygiene products. <strong>India loses 23 million girls to school dropout every year</strong> - not to illness, not to child marriage, but to something completely preventable: period poverty.`,
    futureLine: `For most of us, menstruation is an inconvenience. For <strong>23 million girls in India</strong>, it's the end of their education.`,
    inviteLine: `I'm reaching out through the <strong>Joint Women's Programme</strong> to ask if you'd join as a <strong>Wings of Hope Ambassador</strong>. Together we deliver <strong>sustainable pad kits</strong> alongside open, empowering counselling circles.`,
    impactLine: `Your leadership keeps momentum high so more girls stay in classrooms, graduate on time, and step into leadership themselves.`,
    ctaLine: `Would you be open to a short five-minute call to discuss how you might champion this effort?`
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
  1: 'Be the Voice for Change: Join Wings of Hope',
  '1a': 'Keep girls in school with Wings of Hope',
  '1b': 'Help us stop 23M girls from dropping out',
  '1c': 'Can we chat about Wings of Hope?',
  '1d': 'Your leadership can empower schoolgirls',
  '1e': 'Stand with girls facing period poverty',
  '1f': 'A quick way to support Wings of Hope',
  '1g': 'Join our mission to end period poverty',
  '1h': "Let's keep girls learning together",
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
const variantCount = Object.keys(firstTouchTemplates).length;
console.log(`   - ${variantCount} touchpoint 1 variants (1, 1a-1i)`);
console.log(`   - 6 follow-up templates (touchpoints 2-7)`);
console.log(`   - ${variantCount} subject lines for touchpoint 1`);
console.log(``);
console.log(`Templates use placeholders:`);
console.log(`   {recipientName} - Will be replaced with actual recipient name (or removed if empty)`);
console.log(`   {senderName} - Will be replaced with sender's display name from config.json`);
console.log(``);

process.exit(0);
