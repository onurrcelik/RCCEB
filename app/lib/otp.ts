// Supabase issues the emailed sign-in code at the length configured on the
// project — 8 digits here, not the 6 you might assume. Both login pages used to
// truncate typed input to 6 characters, so the code could never verify. Accept a
// range instead, so changing that project setting can't silently break sign-in.
export const OTP_MIN_LENGTH = 6;
export const OTP_MAX_LENGTH = 10;
