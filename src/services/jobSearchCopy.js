/**
 * Job Search copy helpers — career inboxes (careers@, hr@, etc.) vs named contacts.
 * Copy is role-neutral so the same templates work for HR, managers, TLs, and ICs.
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
  return name ? `Hi ${name},` : 'Hello,';
}

function companyLabel(company) {
  return company?.trim() || 'your organization';
}

const COPY = {
  openingLine: {
    career: (company) =>
      `I'm reaching out to explore software engineering opportunities at <strong>${company}</strong>. I'd appreciate it if my profile could be considered, or if you could point me to the right person on your hiring or engineering team.`,
    named: (company) =>
      `I'm exploring software engineering opportunities at <strong>${company}</strong>. Whether you're hiring directly, work with recruiting, or know who I should speak with, I'd be grateful for any guidance.`,
  },
  followUpIntro: {
    career: () =>
      `Following up on my note about engineering opportunities in case it got buried.`,
    named: () =>
      `Following up on my note from last week in case it slipped through.`,
  },
  followUpAsk: {
    career: (company) =>
      `I'm still interested in <strong>${company}</strong>. If there are relevant openings, or someone on recruiting or engineering I should connect with, that would help me a lot.`,
    named: (company) =>
      `I'm still interested in <strong>${company}</strong>. If there's an opening, a referral, or even just the right name to reach out to, I'd really appreciate it.`,
  },
  circleBackAsk: {
    career: (company) =>
      `I'm looking for a team where I can own backend and AI infrastructure problems in production, and <strong>${company}</strong> is still high on my list. If there are open roles, or a better contact on your side, I'd be grateful.`,
    named: (company) =>
      `I'm looking for a team where I can own backend and AI infrastructure problems in production, and <strong>${company}</strong> is still high on my list. If you know of anything opening up, or who I should talk to instead, I'd be grateful.`,
  },
  shortAsk: {
    career: (company) =>
      `Still interested in opportunities at <strong>${company}</strong>. Open to an application review, a referral to the right recruiter or hiring manager, or any guidance on current openings.`,
    named: (company) =>
      `Still interested in <strong>${company}</strong>. Open to whatever makes sense on your end: a role, a referral, or a name of someone I should reach out to.`,
  },
  finalAsk: {
    career: (company) =>
      `I'm still interested in <strong>${company}</strong>. If there's a fit among your current openings, or someone on the hiring side I should contact, I'd appreciate the nudge. If not, no worries at all.`,
    named: (company) =>
      `I'm still interested in <strong>${company}</strong>. If there's ever a fit, an opening, or someone I should talk to, I'd appreciate the nudge. If not, totally fine. Thanks for reading this far.`,
  },
};

const SUBJECTS = {
  1: {
    career: 'Software engineering opportunities at {company} – {senderName}',
    named: 'Software engineering opportunities at {company} – {senderName}',
  },
  2: {
    career: 'Following up: {senderName} | {company}',
    named: 'Following up: {senderName} | {company}',
  },
  3: {
    career: 'Quick follow-up on roles at {company}',
    named: 'Quick follow-up on roles at {company}',
  },
  4: {
    career: 'Checking in: {senderName} | {company}',
    named: 'Checking in: {senderName} | {company}',
  },
  5: {
    career: 'Final note: {senderName} | {company}',
    named: 'Final note: {senderName} | {company}',
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
    .replace(/{openingLine}/gi, pickCopy('openingLine', isCareer, company))
    .replace(/{followUpIntro}/gi, pickCopy('followUpIntro', isCareer, company))
    .replace(/{followUpAsk}/gi, pickCopy('followUpAsk', isCareer, company))
    .replace(/{circleBackAsk}/gi, pickCopy('circleBackAsk', isCareer, company))
    .replace(/{shortAsk}/gi, pickCopy('shortAsk', isCareer, company))
    .replace(/{finalAsk}/gi, pickCopy('finalAsk', isCareer, company))
    .replace(/{senderName}/gi, sender)
    .replace(/{company}/gi, companyName);

  if (recipientName?.trim()) {
    out = out.replace(/{recipientName}/gi, recipientName.trim());
  } else {
    out = out.replace(/Dear\s+{recipientName},/gi, 'Hello,');
    out = out.replace(/Hi\s+{recipientName},/gi, 'Hello,');
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
