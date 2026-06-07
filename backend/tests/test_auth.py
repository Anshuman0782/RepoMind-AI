import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.security import hash_password, verify_password, create_jwt_token, decode_jwt_token

class AuthSecurityTests(unittest.TestCase):
    def setUp(self):
        self.test_password = "SecurePassword123!"
        self.test_payload = {"user_id": "test-uuid-4567", "email": "test@example.com"}

    def test_password_hashing_and_verification(self):
        # Hash a password
        hashed = hash_password(self.test_password)
        self.assertNotEqual(self.test_password, hashed)
        
        # Verify the correct password
        self.assertTrue(verify_password(self.test_password, hashed))
        
        # Verify an incorrect password fails
        self.assertFalse(verify_password("IncorrectPassword123!", hashed))
        self.assertFalse(verify_password("", hashed))

    def test_jwt_token_generation_and_decoding(self):
        # Generate token
        token = create_jwt_token(self.test_payload, expires_delta_hours=1)
        self.assertIsNotNone(token)
        self.assertIsInstance(token, str)
        
        # Decode token
        decoded = decode_jwt_token(token)
        self.assertIsNotNone(decoded)
        self.assertEqual(decoded["user_id"], self.test_payload["user_id"])
        self.assertEqual(decoded["email"], self.test_payload["email"])
        
    def test_invalid_jwt_decoding_fails(self):
        # Decodes of junk strings should gracefully return None
        self.assertIsNone(decode_jwt_token("completely-invalid-token-string"))
        self.assertIsNone(decode_jwt_token(""))

if __name__ == "__main__":
    unittest.main()
