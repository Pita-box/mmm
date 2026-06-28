/**
 * Serverové singletony Drive_Connector a úložiště (task 21.2).
 *
 * Connector a úložiště se vytvářejí jednou pro Node runtime. Connector se
 * inicializuje líně, aby chybějící `STREAMING_TOKEN_SECRET` neshodil build při
 * pouhém importu modulu — selže až při prvním reálném použití (vydání/ověření
 * tokenu). Úložiště je zatím stub (Service Account se napojí, až budou
 * nakonfigurované přihlašovací údaje); rozhraní `DriveStorage` je stabilní.
 */
import {
  createDriveConnector,
  createStubDriveStorage,
  type DriveConnector,
  type DriveStorage,
} from "@/services/drive-connector";
import { createGoogleDriveStorage } from "@/lib/google-drive-storage";

/**
 * Sdílené úložiště médií. Reálné Google Drive jen když `DRIVE_STORAGE=real` a
 * neběžíme v testu (testy zůstávají hermetické na stubu). Jinak stub.
 * ponytail: výběr přepínačem prostředí, žádná DI vrstva navíc.
 */
export const driveStorage: DriveStorage =
  process.env.DRIVE_STORAGE === "real" && process.env.NODE_ENV !== "test"
    ? createGoogleDriveStorage()
    : createStubDriveStorage();

let connector: DriveConnector | null = null;

/** Vrátí (líně inicializovaný) Drive_Connector vázaný na sdílené úložiště. */
export function getDriveConnector(): DriveConnector {
  if (connector === null) {
    connector = createDriveConnector({ storage: driveStorage });
  }
  return connector;
}
