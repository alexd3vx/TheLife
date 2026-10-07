import { Avatar } from "./avatar";
import { loadSavedLook, parseLook, type Look } from "./looks";
import { loadManifest } from "./manifest";

/**
 * Where a person's look comes from, and how a person is made. Every screen that shows a character goes through here, so the creator, the
 * profile, the home, the street, the buildings and other players show the same person.
 *
 * The rule: the look kept with the life (on the server) is the person. The copy saved on this device is only a fall-back for the
 * creator (before a life exists) and the developer tools.
 */
export function resolveLook(lifeLook?: string | null): Look {
  if (lifeLook) {
    try {
      return parseLook(lifeLook);
    } catch {
      /* fall through to the device copy */
    }
  }
  return loadSavedLook();
}

/** A loaded person, ready to play clips. */
export async function createCharacter(look: Look, options: { face?: boolean } = { face: true }): Promise<Avatar> {
  const manifest = await loadManifest();
  const avatar = new Avatar(manifest, look, options);
  await avatar.load();
  return avatar;
}
