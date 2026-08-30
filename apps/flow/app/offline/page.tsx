import { OfflinePage, getPwaConfig } from "@elio/pwa";

export default function Offline() {
  return <OfflinePage appName={getPwaConfig("flow").name} />;
}
