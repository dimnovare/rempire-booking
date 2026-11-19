import { LogoMark } from "@/components/brand";

export default function NotFound() {
  return (
    <main className="app">
      <header className="hd plain">
        <span className="hd-gap" />
        <LogoMark />
      </header>
      <div className="stack">
        <h1 className="h1">404</h1>
        <p className="lead">
          <a className="link" href="/">
            REMPIRE · Booking
          </a>
        </p>
      </div>
    </main>
  );
}
