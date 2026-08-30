import type { MetadataRoute } from "next";
import { buildWebManifest, getPwaConfig } from "@elio/pwa";

export default function manifest(): MetadataRoute.Manifest {
  return buildWebManifest(getPwaConfig("flow")) as MetadataRoute.Manifest;
}
