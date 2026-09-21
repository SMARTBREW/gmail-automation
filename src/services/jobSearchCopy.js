/**
 * Job Search copy helpers — warm, direct, no ultimatums.
 * 4 touchpoints. Avoid em/en dashes in copy.
 */

const CAREER_LOCAL_PARTS = new Set([
  'careers',
  'career',
  'hr',
  'recruitment',
  'recruiting',
  'hiring',
  'jobs',
  'talent',
  'people',
  'peopleops',
  'peopleoperations',
  'peopleteam',
  'humanresources',
  'hrteam',
  'talentacquisition',
  'campus',
  'campushiring',
  'university',
  'join',
  'apply',
  'applications',
]);

export function isCareerMailbox(email) {
  const local = (String(email || '').split('@')[0] || '').toLowerCase().replace(/[._-]/g, '');
  if (CAREER_LOCAL_PARTS.has(local)) return true;
  return (
    local.includes('recruit') ||
    local.includes('career') ||
    local.startsWith('hr') ||
    local.includes('hiring') ||
    local.includes('talent') ||
    local.includes('peopleops')
  );
}

export function getJobSearchGreeting(recipientName) {
  const name = String(recipientName || '').trim();
  return name ? `Hi ${name},` : 'Hi,';
}

function companyLabel(company) {
  return company?.trim() || 'your organization';
}

const COPY = {
  tldr: {
    career: () =>
      `I don't have many hobbies outside building software. When I find a company whose product I respect, I want to contribute: heads down, shipping, helping take something from 0 to 1 or 1 to 100. That's what I'm optimizing for right now.`,
    named: () =>
      `I don't have many hobbies outside building software. When I find a company whose product I respect, I want to contribute: heads down, shipping, helping take something from 0 to 1 or 1 to 100. That's what I'm optimizing for right now.`,
  },
  openingLine: {
    career: (company) =>
      `Really respected what <strong>${company}</strong> is building and wanted to reach out to see if there are openings for engineers, or if you could point me to the right person on the hiring / engineering side.`,
    named: (company) =>
      `Really respected what <strong>${company}</strong> is building and wanted to reach out to see if there were any openings for engineers on the team (or if you know who I should talk to).`,
  },
  askLine: {
    career: (company) =>
      `I'd love to be part of a team at <strong>${company}</strong> that's building hard things. Looking forward to hearing from you whenever you have a moment.`,
    named: (company) =>
      `I'd love to be part of a team at <strong>${company}</strong> that's building hard things. Looking forward to hearing from you whenever you have a moment.`,
  },
  followUpIntro: {
    career: () =>
      `Just floating my earlier note back up in case it got buried.`,
    named: () =>
      `Just floating my earlier note back up in case it got buried.`,
  },
  followUpAsk: {
    career: (company) =>
      `I'm still very interested in <strong>${company}</strong>. If there are relevant openings, or someone on recruiting / engineering I should connect with, I'd really appreciate it.`,
    named: (company) =>
      `I'm still very interested in <strong>${company}</strong>. If there's an opening, a referral, or even just the right name to reach out to, I'd really appreciate it.`,
  },
  circleBackAsk: {
    career: (company) =>
      `I'm looking for a lean team where I can own backend and AI infra end-to-end, and <strong>${company}</strong> is still high on that list. If there are open roles, or a better contact on your side, I'd be grateful.`,
    named: (company) =>
      `I'm looking for a lean team where I can own backend and AI infra end-to-end, and <strong>${company}</strong> is still high on that list. If you know of anything opening up, or who owns hiring, I'd be grateful.`,
  },
  finalAsk: {
    career: (company) =>
      `I'll leave this as my last note for now. I'm still interested in <strong>${company}</strong>. If there's a fit among your openings, or someone on hiring I should contact, I'd appreciate the nudge. If not, totally fine.`,
    named: (company) =>
      `I'll leave this as my last note for now. I'm still interested in <strong>${company}</strong>. If there's a fit, an opening, or someone I should talk to, I'd appreciate the nudge. If not, totally fine.`,
  },
};

const SUBJECTS = {
  1: {
    career: 'Engineering at {company}',
    named: 'Engineering at {company}',
  },
  2: {
    career: 'Following up: Engineering at {company}',
    named: 'Following up: Engineering at {company}',
  },
  3: {
    career: 'Quick follow-up on {company}',
    named: 'Quick follow-up on {company}',
  },
  4: {
    career: 'Last note for now: {senderName} | {company}',
    named: 'Last note for now: {senderName} | {company}',
  },
};

function pickCopy(key, isCareer, company) {
  const variant = isCareer ? 'career' : 'named';
  return COPY[key][variant](companyLabel(company));
}

function pickSubject(touchpoint, isCareer) {
  const tp = SUBJECTS[touchpoint] || SUBJECTS[1];
  return isCareer ? tp.career : tp.named;
}

export function applyJobSearchPlaceholders(text, { recipientName, company, senderName, to, touchpoint = 1 }) {
  if (!text) return text;

  const isCareer = isCareerMailbox(to);
  const greeting = getJobSearchGreeting(recipientName);
  const companyName = companyLabel(company);
  const sender = senderName || '';

  let out = text
    .replace(/{greeting}/gi, greeting)
    .replace(/{tldr}/gi, pickCopy('tldr', isCareer, company))
    .replace(/{openingLine}/gi, pickCopy('openingLine', isCareer, company))
    .replace(/{askLine}/gi, pickCopy('askLine', isCareer, company))
    .replace(/{followUpIntro}/gi, pickCopy('followUpIntro', isCareer, company))
    .replace(/{followUpAsk}/gi, pickCopy('followUpAsk', isCareer, company))
    .replace(/{circleBackAsk}/gi, pickCopy('circleBackAsk', isCareer, company))
    .replace(/{finalAsk}/gi, pickCopy('finalAsk', isCareer, company))
    .replace(/{senderName}/gi, sender)
    .replace(/{company}/gi, companyName);

  if (recipientName?.trim()) {
    out = out.replace(/{recipientName}/gi, recipientName.trim());
  } else {
    out = out.replace(/Dear\s+{recipientName},/gi, 'Hi,');
    out = out.replace(/Hi\s+{recipientName},/gi, 'Hi,');
    out = out.replace(/{recipientName}/gi, '');
  }

  return out;
}

export function applyJobSearchSubject(subject, { company, senderName, to, touchpoint = 1 }) {
  const isCareer = isCareerMailbox(to);
  const base = pickSubject(touchpoint, isCareer);
  return applyJobSearchPlaceholders(base, {
    recipientName: '',
    company,
    senderName,
    to,
    touchpoint,
  });
}
