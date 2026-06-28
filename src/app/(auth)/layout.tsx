import { Logo } from "@/components/brand/logo";
import { AuthHero } from "@/components/auth/auth-hero";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-[1.05fr_1fr] xl:grid-cols-[1.1fr_1fr]">
      {/* Left: branded testimonial panel */}
      <AuthHero />

      {/* Right: form */}
      <div className="relative flex items-center justify-center p-6 sm:p-10 lg:p-12 bg-white">
        {/* mobile-only soft background accent */}
        <div className="lg:hidden absolute inset-0 bg-gradient-to-br from-blue-50 via-white to-indigo-50 pointer-events-none" />
        <div className="relative w-full max-w-md">
          <div className="lg:hidden mb-8 flex justify-center">
            <Logo />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
