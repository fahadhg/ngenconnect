// Test authentication system - bypasses Supabase for UI testing
// Remove this file and revert to Supabase auth when ready for production

const TEST_USER = {
  id: "test-user-123",
  email: "test@ngenconnect.com",
  user_metadata: {
    full_name: "Test User",
  },
};

export function isTestAuthEnabled(): boolean {
  return typeof window !== "undefined" && localStorage.getItem("test_auth_enabled") === "true";
}

export function enableTestAuth(): void {
  if (typeof window !== "undefined") {
    localStorage.setItem("test_auth_enabled", "true");
    localStorage.setItem("test_user", JSON.stringify(TEST_USER));
  }
}

export function disableTestAuth(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem("test_auth_enabled");
    localStorage.removeItem("test_user");
  }
}

export function getTestUser() {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem("test_user");
  return stored ? JSON.parse(stored) : null;
}

export function testSignIn(email: string, password: string): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    setTimeout(() => {
      // Accept any email/password for testing
      if (email && password && password.length >= 6) {
        const user = {
          id: "test-user-123",
          email: email,
          user_metadata: {
            full_name: email.split("@")[0],
          },
        };
        localStorage.setItem("test_auth_enabled", "true");
        localStorage.setItem("test_user", JSON.stringify(user));
        resolve({ success: true });
      } else {
        resolve({ success: false, error: "Invalid email or password" });
      }
    }, 500); // Simulate network delay
  });
}

export function testSignUp(email: string, password: string, fullName: string): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    setTimeout(() => {
      if (email && password && password.length >= 6) {
        const user = {
          id: "test-user-" + Date.now(),
          email: email,
          user_metadata: {
            full_name: fullName || email.split("@")[0],
          },
        };
        localStorage.setItem("test_auth_enabled", "true");
        localStorage.setItem("test_user", JSON.stringify(user));
        resolve({ success: true });
      } else {
        resolve({ success: false, error: "Please provide valid email and password (min 6 characters)" });
      }
    }, 500);
  });
}

export function testSignOut(): void {
  disableTestAuth();
}
