'use strict';
// Creates the first Administrator in a freshly installed, empty database.
//
// The engine copies this file into <install root>\backend and runs it there, so
// @prisma/client and bcryptjs resolve from the installed application's own
// node_modules and the hash matches what the API writes (bcrypt, cost 10).
//
// The caller sends ONE JSON object on stdin: {username, fullName, email,
// password}. The password is never passed in argv or the environment, so it
// cannot be read from the process list or a PM2 environment dump.
//
// Exit codes are part of the engine contract:
//   0  Administrator created
//   10 An active Administrator already exists; nothing was written
//   11 The username is already in use in this database
//   12 The supplied details failed validation
//   13 Database or unexpected failure

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const EXIT = { OK: 0, EXISTS: 10, USERNAME_TAKEN: 11, INVALID: 12, FAILED: 13 };
const USERNAME_RE = /^[A-Za-z0-9._-]{3,32}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 12;
const WEAK_PASSWORDS = new Set([
  'password', 'password1', 'password123', 'changeme', 'changeme123',
  'admin123', 'administrator', 'letmein', 'welcome1', 'qwerty123456',
  'cmms2026', 'cmms123456',
]);

function emit(line) {
  process.stdout.write(line + '\n');
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('error', reject);
    process.stdin.on('end', () => resolve(data));
  });
}

function invalid(message) {
  emit(message);
  return EXIT.INVALID;
}

async function main() {
  let input;
  try {
    input = JSON.parse((await readStdin()) || '{}');
  } catch {
    return invalid('the administrator details were not valid JSON');
  }

  const username = String(input.username || '').trim();
  const fullName = String(input.fullName || '').trim();
  const email = String(input.email || '').trim();
  const password = String(input.password || '');

  if (!USERNAME_RE.test(username)) {
    return invalid('username must be 3-32 characters of A-Z a-z 0-9 . _ -');
  }
  if (!fullName) {
    return invalid('full name is required');
  }
  if (!EMAIL_RE.test(email)) {
    return invalid('email is not a valid address');
  }
  if (password.length < MIN_PASSWORD) {
    return invalid('password must be at least ' + MIN_PASSWORD + ' characters');
  }
  if (password.trim() !== password) {
    return invalid('password must not start or end with whitespace');
  }
  if (password.toLowerCase() === username.toLowerCase()) {
    return invalid('password must not be the same as the username');
  }
  if (WEAK_PASSWORDS.has(password.toLowerCase())) {
    return invalid('password is too common');
  }

  const prisma = new PrismaClient();
  let code = EXIT.FAILED;
  try {
    const administrators = await prisma.user.count({
      where: { role: 'Administrator', isDeleted: false },
    });
    if (administrators > 0) {
      emit('an active Administrator already exists; nothing was written');
      return EXIT.EXISTS;
    }

    const clash = await prisma.user.findFirst({
      where: { username, isDeleted: false },
      select: { userId: true },
    });
    if (clash) {
      emit("the username '" + username + "' is already in use in this database");
      return EXIT.USERNAME_TAKEN;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        username,
        passwordHash,
        fullName,
        email,
        role: 'Administrator',
        isActive: true,
        createdBy: 'installer',
        modifiedBy: 'installer',
      },
      select: { userId: true, username: true },
    });
    emit("created Administrator '" + user.username + "' (" + user.userId + ')');
    code = EXIT.OK;
  } catch (error) {
    emit('administrator creation failed: ' + (error && error.message ? error.message : String(error)));
    code = EXIT.FAILED;
  } finally {
    try { await prisma.$disconnect(); } catch { /* nothing left to do */ }
  }
  return code;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    emit('administrator creation failed: ' + (error && error.message ? error.message : String(error)));
    process.exit(EXIT.FAILED);
  });
