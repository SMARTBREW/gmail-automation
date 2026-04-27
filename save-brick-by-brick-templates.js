import dotenv from 'dotenv';
dotenv.config();
import { connectMongo } from './src/db/mongo.js';
import { CampaignTemplate } from './src/models/CampaignTemplate.js';
await connectMongo();

const campaignName = 'Brick by Brick';

const templates = {
  1: `<p>Hello {recipientName}!</p>
<p>We hope you are doing well.</p>
<p>We wanted to share something close to our hearts. We recently performed the Bhoomi Poojan for Shukrana - our upcoming Animal Care Shelter & Hospital for rescued animals in Gurgaon. This space will be a safe, loving home for over 100 ailing, injured, and sick streeties, with round-the-clock care and everything they need to heal.</p>
<p>We're beginning with the boundary wall - 70,000 bricks that will be the very first act of protection for animals who have never had one. It's a beautiful place to start.</p>
<p>We'd love for you to join us as a Campaign Ambassador for Brick by Brick, and help champion for the voiceless. There's something special about being part of building something from the ground up - and we'd be honoured to have you with us.</p>
<p>We'd love to share more at your convenience!</p>
<p>Warmest Regards,<br>
<strong>{senderName}</strong><br>
Brick by Brick | AnimalCare<br>
The Giving Circle</p>`,

  2: `<p>Hello again {recipientName}!</p>
<p>Hope this finds you well!</p>
<p>We wanted to follow up - and give you a clearer, honest picture of what being a Cause Champion actually looks like.</p>
<p>It's simpler than you might think. And more meaningful than almost anything else you could do this season.</p>
<p>As a Cause Champion, all you'd be doing is:</p>
<p>→ Sharing the Brick by Brick campaign with people in your circle who love animals<br>
→ Telling the story in your own words - we'll give you everything you need<br>
→ Being the bridge between people who want to help and the animals who need it most</p>
<p>That's it. Your voice, your circle, your heart.</p>
<p>Every brick of Shukrana's boundary wall represents safety that 100+ rescued animals have never known. When that wall rises, animals with broken limbs, maggot wounds, and nowhere to go will finally have a place that is truly theirs.</p>
<p>You'd be part of making that real - from the very first brick.</p>
<p>Would you be open to a quick call this week? We'd love to walk you through the vision.</p>
<p>With gratitude,<br>
<strong>{senderName}</strong><br>
Brick by Brick | AnimalCare<br>
The Giving Circle</p>`,

  3: `<p>Hello again {recipientName},</p>
<p>Close your eyes for a moment and imagine this.</p>
<p>A rescued dog - injured, frightened, found on a Gurgaon road - is brought through Shukrana's gate for the first time. There's a warm kennel waiting. A medical room ready. A team on hand. A boundary wall that says: you are safe here now.</p>
<p>That moment is what we are building toward.</p>
<p>The boundary wall - 70,000 bricks - is where it all begins. It's the first thing that goes up, and it makes everything else possible. Once it stands, construction of the shelter spaces inside can begin in earnest. Every section. Every healing room. Every kennel.</p>
<p>We're running the Brick by Brick campaign right now, and we'd love for you to be an Ambassador who helps us bring this vision to life.</p>
<p>The people in your network who care about animals can be part of this story - early. They can be among the ones who helped lay the very first bricks of a place that will serve hundreds of animals for years to come.</p>
<p>That's a beautiful thing to be part of.</p>
<p>We'd be so glad to have you with us.</p>
<p>Warmly,<br>
<strong>{senderName}</strong><br>
Brick by Brick | AnimalCare<br>
The Giving Circle</p>`,

  4: `<p>Hello {recipientName},</p>
<p>We want to share something with you because we think it's genuinely exciting.</p>
<p>We have a real window of opportunity ahead of us. The boundary wall of Shukrana needs to go up before the monsoon season arrives, so that construction of the shelter spaces inside can begin without interruption. That gives us the next several weeks to build momentum - and we're already moving.</p>
<p>This is one of those rare moments when timing and purpose align.</p>
<p>₹10 per brick. 70,000 bricks. One campaign. And a community of people choosing to show up for animals who can't speak for themselves.</p>
<p>As a Champion, your role would simply be to share the campaign with the people around you - and let them decide what feels right. Some will give 50 bricks. Some will give 500. All of it counts.</p>
<p>What's beautiful about Brick by Brick is that it gives people something concrete to hold onto. Not just a donation - a brick. A real piece of a real wall. That's a story worth telling.</p>
<p>A quick call is all it takes to get started.</p>
<p>With gratitude,<br>
<strong>{senderName}</strong><br>
Brick by Brick | AnimalCare<br>
The Giving Circle</p>`,

  5: `<p>Hello {recipientName},</p>
<p>We have some lovely news to share.</p>
<p>In the past few weeks, people across Gurgaon - and well beyond - have started coming together for Brick by Brick. Champions have stepped up. Bricks are being counted. A community is forming around something that genuinely matters.</p>
<p>Every message shared, every person who donates ₹500 or ₹5,000 - it adds up to a wall. And that wall changes everything for the animals who will one day walk through Shukrana's gate.</p>
<p>There's a quiet kind of joy in watching this happen. People choosing, freely and warmly, to show up for lives they may never meet. That's what Shukrana is already becoming - even before the first room is built.</p>
<p>We've thought of you often through all of this. We genuinely believe your voice and your network would bring something special to this campaign.</p>
<p>The window to be a Founding Champion - someone who was here from the very beginning - is still open.</p>
<p>Would you like to step into it?</p>
<p>Warmly,<br>
<strong>{senderName}</strong><br>
Brick by Brick | AnimalCare<br>
The Giving Circle</p>`,

  6: `<p>Hello {recipientName},</p>
<p>We've shared the vision. We've shared the joy of what's already happening. And we know you care - that's why we keep writing.</p>
<p>So today, we simply want to ask: Will you be a Champion for Shukrana?</p>
<p>Here's what it looks like in practice:</p>
<p>→ Step 1: We send you the Brick by Brick campaign message - tailored, ready to share.<br>
→ Step 2: You forward it to 5-10 people in your network who love animals.<br>
→ Step 3: You let us know how it goes. We take care of everything else.</p>
<p>That's the whole ask. One round of messages. A few minutes of your time.</p>
<p>And the ripple from that? If even 3 people from your circle donate ₹2,000 each - that's 600 bricks in the wall of Shukrana. Bricks that will stand long after the campaign ends.</p>
<p>Reply to this message whenever you're ready. We'll take it from there with joy.</p>
<p>With so much gratitude,<br>
<strong>{senderName}</strong><br>
Brick by Brick | AnimalCare<br>
The Giving Circle</p>`,

  7: `<p>Hello {recipientName},</p>
<p>This is our last message in this series, and we want to write it the way we've tried to write all the others - with honesty and warmth, and without any pressure.</p>
<p>We don't know what's been on your plate these past few weeks. Life is full. We understand completely.</p>
<p>But before we close this chapter of our reaching out to you, we wanted to say one more thing.</p>
<p>Being a Founding Champion of Shukrana is a kind of opportunity that makes a lasting difference. It means being someone who said yes at the very beginning - before the walls were up, before the doors opened, before the first rescued dog walked in and found a home.</p>
<p>That's a story worth having.</p>
<p>The boundary wall - 70,000 bricks - is where it all starts. And every Champion who shares the campaign brings us closer to the moment when it stands.</p>
<p>If you'd like to be part of this, we would be genuinely honoured. We'll send everything you need. One message to your network. That's all it takes.</p>
<p>And if the timing isn't right for now - we understand, and we hope you'll visit Shukrana someday when the doors are open and the animals are home. We'd love to show you what we built together.</p>
<p>Thank you for reading these messages, {recipientName}. It has meant more than you know.</p>
<p>With deep gratitude,<br>
<strong>{senderName}</strong><br>
Brick by Brick | AnimalCare<br>
The Giving Circle</p>`,
};

const subjectLines = {
  1: "Shukrana is being built - and we'd love you with us",
  2: 'What it really means to be a Champion for Shukrana',
  3: "Picture this: Shukrana's doors open for the first time",
  4: "There's a window right now - and it's a meaningful one",
  5: 'Something beautiful is happening around Shukrana',
  6: 'One message. One circle. One wall.',
  7: 'Our last note - and our most heartfelt',
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
console.log(`   - 7 touchpoint templates (initial + 6 follow-ups)`);
console.log(`   - 7 subject lines (one for each touchpoint)`);
console.log(``);
console.log(`Templates use placeholders:`);
console.log(`   {recipientName} - Will be replaced with actual recipient name (or removed if empty)`);
console.log(`   {senderName} - Will be replaced with sender's display name from config.json`);
console.log(``);

process.exit(0);
