export const checkQuery = `
SELECT * FROM users WHERE name = $1 OR email = $2
`;
export const insertNewQuery = `
INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3)
RETURNING id, name, email, created_at;
`;
export const findUser = `
SELECT id, name, email, password_hash, is_verified 
FROM users WHERE name = $1 OR email = $2
`;
export const updateQuery = `
UPDATE users SET is_verified = true 
WHERE email = $1
`;
export const checkEmailExistsQuery = `
SELECT * FROM users WHERE email = $1
`;
