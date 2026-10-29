import "./globals.css";
import NovaNavigation from "../components/nova-navigation";

export const metadata = {
  title: "VOOM SYSTEM · NOVA",
  description: "AI trading research platform with read-only broker checks and live trading disabled."
};

export default function RootLayout({ children }) {
  return (
    <html lang="th">
      <body>
        <div className="nova-backdrop" aria-hidden="true">
          <div className="nova-glow nova-glow-purple" />
          <div className="nova-glow nova-glow-blue" />
        </div>
        <div className="nova-app"><NovaNavigation />{children}</div>
      </body>
    </html>
  );
}