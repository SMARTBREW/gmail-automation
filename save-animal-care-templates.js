import dotenv from 'dotenv';
dotenv.config();
import { connectMongo } from './src/db/mongo.js';
import { CampaignTemplate } from './src/models/CampaignTemplate.js';
await connectMongo();

const campaignName = 'Animal Care';

const aboutUsBlock = `<p><strong>About Animal Care</strong><br>
Founded from a deep commitment to alleviating animal suffering, AnimalCare India is a nationally recognized animal welfare organization dedicated to creating compassionate communities where animals and people thrive together. Through our comprehensive program - including anti-rabies vaccination drives, emergency rescue operations, sterilization, and community education - we work toward India's goal of zero rabies deaths by 2030. Operating in alignment with WHO guidelines and Supreme Court directives, we've rescued and treated thousands of street animals while inspiring empathy across communities. At our core is the belief that every animal deserves dignity. Registered under the Prevention of Cruelty to Animals Act, 1960, and holding 12A, 80G, and CSR certifications, we're committed to evidence-based, humane solutions that protect both animal and human lives.</p>`;

// Touchpoint 1: Initial email
const firstTouchTemplates = {
  1: `<p>Hi {recipientName},</p>
<p>Did you know that India accounts for 36% of global rabies deaths, with over 18,000 lives lost annually? Yet the solution is scientifically proven: vaccinating just 70% of street dogs eliminates human rabies transmission entirely.</p>
<p>Now imagine neighborhoods where children and street dogs coexist safely, where these loyal animals continue their role as natural community guardians. At Pawsitive Protectors, we believe this future is within reach, and with your help, we can make it happen.</p>
<p>As a passionate volunteer for this cause, I'd like to invite you on behalf of Pawsitive Protectors to be an Ambassador for our anti-rabies vaccination drive. Your voice will help us protect both people and animals by vaccinating street dogs - creating safer communities while honoring these animals' dignity as the community protectors they truly are.</p>
<p>Your leadership and influence will play a crucial role in spreading awareness and inspiring collective action. With your support, we can reach the critical 70% vaccination coverage needed to eliminate rabies deaths.</p>
<p>Would you be open to a quick 5-minute call to explore how you could join as a Pawsitive Protectors Ambassador?</p>
<p>Sincere regards,<br>
<strong>{senderName}</strong><br>
Pawsitive Protectors | Animal Care<br>
Giving Circle Volunteer</p>
${aboutUsBlock}`,
};

const templates = {
  ...firstTouchTemplates,
  
  // Touchpoint 2: First follow-up
  2: `<p>Hi again {recipientName},</p>
<p>I hope this message finds you well. Just checking in to see if you had a chance to look at my previous note on our anti-rabies vaccination initiative.</p>
<p>Here's something that moved me: each vaccinated street dog protects 15-20 people daily in crowded urban areas. One animal, dozens of lives safeguarded - that's the multiplier effect of every single vaccination.</p>
<p>Your willingness to support us as a "Pawsitive Protectors Ambassador" will help us scale this cascading impact across communities.</p>
<p>Even a brief chat or a message of support would mean a lot.</p>
<p>With Hope & Gratitude,<br>
<strong>{senderName}</strong><br>
Pawsitive Protectors | Animal Care<br>
Giving Circle Volunteer</p>
${aboutUsBlock}`,

  // Touchpoint 3: Second follow-up
  3: `<p>{recipientName} – It's {senderName} reaching out again. I know you're busy, but I didn't want you to miss this opportunity to be part of a proven solution.</p>
<p>The Supreme Court has issued clear directives on humane stray dog management, mandating vaccination and sterilization as the path forward. Our work directly supports these legal frameworks - offering communities the science-based approach that protects both people and animals with dignity.</p>
<p>Your voice and influence could help neighborhoods embrace this evidence-based solution. Even a short conversation could make a big difference.</p>
<p>Looking forward to hearing back from you.</p>
<p>With Hope & Gratitude,<br>
<strong>{senderName}</strong><br>
Pawsitive Protectors | Animal Care<br>
Giving Circle Volunteer</p>
${aboutUsBlock}`,

  // Touchpoint 4: Third follow-up
  4: `<p>Hi {recipientName},</p>
<p>Greetings! India has set an ambitious target: zero rabies deaths by 2030. We're just five years away, and achieving this requires urgent community action now.</p>
<p>What inspired me to lead these vaccination drives? Learning that we're not asking for the impossible - the WHO confirms that 70% dog vaccination coverage completely eliminates human rabies transmission. It's mathematically achievable, scientifically proven, and ensures street dogs can continue their natural role as community guardians safely.</p>
<p>We can't do this without partners like you and hence my persistence.</p>
<p>A quick yes from you will help us bring protection to another neighborhood of families - and dignity to the dogs who serve them.</p>
<p>Hoping to hear back from you.</p>
<p><strong>{senderName}</strong><br>
Pawsitive Protectors | Animal Care<br>
Giving Circle Volunteer</p>
${aboutUsBlock}`,

  // Touchpoint 5: Fourth follow-up
  5: `<p>Hi again {recipientName}, I have a happy update to share. With support from noble Pawsitive Protectors Ambassadors, we've vaccinated 7000+ street dogs across multiple communities - and we're expanding weekly.</p>
<p>The response has been truly inspiring! Feeders and community members are seeing firsthand how vaccination strengthens the bond between neighborhoods and their street dogs. These animals continue watching over local areas, now with the health protection they deserve.</p>
<p>Your involvement could help us scale this impact toward the critical threshold needed for rabies elimination.</p>
<p>Together, we can make rabies deaths a thing of the past while ensuring street dogs remain valued community members.</p>
<p>A YES from you will be a huge support.</p>
<p>With Hope & Gratitude,<br>
<strong>{senderName}</strong><br>
Pawsitive Protectors | Animal Care<br>
Giving Circle Volunteer</p>
${aboutUsBlock}`,

  // Touchpoint 6: Fifth follow-up
  6: `<p>{recipientName}, I hope you are doing well.</p>
<p>Thank you for staying with me through these messages - it means a lot. As we move deeper into winter, our drives now include coats and blankets for vulnerable street animals alongside vaccinations - because protecting community health means caring for the loyal animals who watch over us.</p>
<p>I completely understand how busy schedules can get, but even a quick reply saying "interested" or "tell me more" would mean the world to us.</p>
<p>With sincere regards,<br>
<strong>{senderName}</strong><br>
Pawsitive Protectors | Animal Care<br>
Giving Circle Volunteer</p>
${aboutUsBlock}`,

  // Touchpoint 7: Final follow-up
  7: `<p>Hi {recipientName},</p>
<p>This will be my final note, and I wanted to keep it heartfelt.</p>
<p>Every two hours, someone in India dies from rabies - not because solutions don't exist, but because we haven't reached the vaccination coverage that science proves eliminates transmission.</p>
<p>I reached out because I genuinely believe you have both the platform and the heart to help change this. I understand timing isn't always right, but I hope this cause stays with you.</p>
<p>Whenever you feel ready to help protect communities while honoring street dogs with the care they deserve - whether that's now or in the future - my inbox will be open.</p>
<p>Until then, you're welcome to follow our work at <a href="https://www.instagram.com/pawsitiveprotectors/">https://www.instagram.com/pawsitiveprotectors/</a>.</p>
<p>Thank you so much for taking the time to read this.</p>
<p><strong>{senderName}</strong><br>
Pawsitive Protectors | Animal Care<br>
Giving Circle Volunteer</p>
${aboutUsBlock}`,
};

const subjectLines = {
  1: 'Join Pawsitive Protectors: Eliminate Rabies Deaths Together',
  2: 'Re: Join Pawsitive Protectors: Eliminate Rabies Deaths Together',
  3: 'Re: Join Pawsitive Protectors: Eliminate Rabies Deaths Together',
  4: 'Re: Join Pawsitive Protectors: Eliminate Rabies Deaths Together',
  5: 'Re: Join Pawsitive Protectors: Eliminate Rabies Deaths Together',
  6: 'Re: Join Pawsitive Protectors: Eliminate Rabies Deaths Together',
  7: 'Re: Join Pawsitive Protectors: Eliminate Rabies Deaths Together',
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
console.log(`   - 6 follow-up templates (touchpoints 2-7)`);
console.log(`   - 7 subject lines (one for each touchpoint)`);
console.log(``);
console.log(`Templates use placeholders:`);
console.log(`   {recipientName} - Will be replaced with actual recipient name (or removed if empty)`);
console.log(`   {senderName} - Will be replaced with sender's display name from config.json`);
console.log(``);

process.exit(0);

