// Amplify Auth config for Cognito + Google OIDC (DESIGN-001 §4.2).
// Values come from env; left blank until the Google OAuth + Cognito prerequisites exist.

export const amplifyConfig = {
  Auth: {
    Cognito: {
      userPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID ?? "",
      userPoolClientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID ?? "",
      loginWith: {
        oauth: {
          domain: process.env.NEXT_PUBLIC_COGNITO_DOMAIN ?? "",
          scopes: ["openid", "email", "profile"],
          redirectSignIn: ["http://localhost:3000/auth/callback"],
          redirectSignOut: ["http://localhost:3000"],
          responseType: "code" as const,
          providers: ["Google" as const],
        },
      },
    },
  },
};
