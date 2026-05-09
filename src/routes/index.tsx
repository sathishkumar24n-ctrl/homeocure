import { createFileRoute, Link } from "@tanstack/react-router";
import {
  CalendarCheck,
  HeartPulse,
  Leaf,
  MessageCircle,
  Package,
  TrendingUp,
  Users,
  Sparkles,
} from "lucide-react";
import { SiteHeader } from "@/components/site-layout";
import heroImage from "@/assets/hero-clinic.jpg";

export const Route = createFileRoute("/")({
  component: Index,
});

const features = [
  { icon: Users, title: "Patient CRM", desc: "Complete database with constitution, miasm, and history." },
  { icon: HeartPulse, title: "Visit History", desc: "Chronological notes, prescriptions, and attachments." },
  { icon: MessageCircle, title: "WhatsApp Booking", desc: "Patients book and confirm appointments instantly." },
  { icon: CalendarCheck, title: "Auto Follow-ups", desc: "Smart reminders 7, 15, or 30 days post visit." },
  { icon: Package, title: "Remedy Inventory", desc: "Track potency, batch, expiry, and reorder levels." },
  { icon: TrendingUp, title: "Income & Reports", desc: "See revenue, trends, and top remedies at a glance." },
];

function Index() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-hero">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 md:grid-cols-2 md:py-20">
          <div className="space-y-6 text-center md:text-left">
            <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/70 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Built for homeopathy clinics
            </span>
            <h1 className="text-4xl font-extrabold leading-tight tracking-tight text-foreground sm:text-5xl md:text-6xl">
              Calm, modern care
              <span className="block bg-gradient-primary bg-clip-text text-transparent">
                for every patient.
              </span>
            </h1>
            <p className="mx-auto max-w-md text-base text-muted-foreground md:mx-0 md:text-lg">
              HomeoCare helps small homeopathy clinics run patients, appointments,
              follow-ups, and inventory — all from your phone.
            </p>
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center md:justify-start">
              <Link
                to="/signup"
                className="inline-flex w-full items-center justify-center rounded-full bg-gradient-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-elevated transition-smooth hover:opacity-95 sm:w-auto"
              >
                Create your clinic
              </Link>
              <Link
                to="/login"
                className="inline-flex w-full items-center justify-center rounded-full border border-border bg-card/80 px-6 py-3 text-sm font-semibold text-foreground backdrop-blur transition-smooth hover:bg-muted sm:w-auto"
              >
                I already have an account
              </Link>
            </div>
            <p className="text-xs text-muted-foreground">
              Installable on Android · Free to start · No credit card
            </p>
          </div>

          <div className="relative">
            <div className="absolute inset-0 -z-10 rounded-[3rem] bg-gradient-soft blur-2xl opacity-70" />
            <img
              src={heroImage}
              alt="Homeopathy doctor with smiling patient"
              width={1280}
              height={1024}
              className="mx-auto w-full max-w-md rounded-[2rem] shadow-elevated"
            />
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto w-full max-w-6xl px-4 py-16 md:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Everything your clinic needs
          </h2>
          <p className="mt-3 text-muted-foreground">
            One pleasant app — for doctors and patients alike.
          </p>
        </div>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="group rounded-2xl border border-border/60 bg-card p-6 shadow-card transition-smooth hover:-translate-y-1 hover:shadow-elevated"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary text-secondary-foreground transition-smooth group-hover:bg-gradient-primary group-hover:text-primary-foreground">
                <f.icon className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-foreground">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto w-full max-w-6xl px-4 pb-20">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-primary p-8 text-center shadow-elevated md:p-14">
          <Leaf className="absolute -right-6 -top-6 h-40 w-40 text-primary-foreground/10" />
          <h3 className="text-2xl font-bold text-primary-foreground sm:text-3xl">
            Ready to bring calm to your clinic?
          </h3>
          <p className="mx-auto mt-2 max-w-md text-primary-foreground/85">
            Set up in minutes. Start with patients, then layer on inventory and WhatsApp.
          </p>
          <Link
            to="/signup"
            className="mt-6 inline-flex items-center justify-center rounded-full bg-card px-6 py-3 text-sm font-semibold text-foreground shadow-soft transition-smooth hover:scale-[1.02]"
          >
            Get started — it's free
          </Link>
        </div>
      </section>

      <footer className="border-t border-border/60 py-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} HomeoCare · Made with care for small clinics
      </footer>
    </div>
  );
}
