import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <SignIn afterSignInUrl="/chat" />
    </div>
  );
}
