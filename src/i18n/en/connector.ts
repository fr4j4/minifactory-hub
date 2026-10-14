import type { Shape } from '../translate';
import type { es } from '../es';

export const connector: Shape<typeof es['connector']> = {
  certChanged: 'The printer\'s certificate changed since the first connection. If you replaced or reset it, link it again.',
  wrongAccessCode: 'Incorrect access code (check it on the printer\'s screen: Network → Access code).',
  printerTimeout: 'The printer did not respond in time. Check the IP and that “LAN Mode” is enabled.',
  printerNotConnected: 'The printer is not connected',
  cloudRejected: 'Bambu Cloud rejected the session: the token expired or the session was closed. Sign in again.',
  cloudError: 'Bambu Cloud: {message}',
  cloudCannotRead: 'Bambu Cloud did not allow reading this printer (does it belong to the account?).',
  cloudReadonly: 'Bambu Lab does not allow external programs to control the printer through the cloud. Use Bambu Handy / Bambu Studio, or connect it via LAN with “Developer Mode”.',
  cloudTimeout: 'The printer did not respond through the cloud. Is it on and connected to the internet?',
  noCamera: 'This model has no camera',
  cloudNoSession: 'The Bambu Cloud account has no active session. Sign in again.',
  disconnectedOrDisabled: 'The printer is not connected or is disabled',
  cloudNoCamera: 'The live camera is not available through the cloud',
  invalidAddress: 'Invalid address',
  mustBeLocalExample: 'The printer must be on your local network (for example 192.168.x.x)',
  mustBeLocal: 'The printer must be on your local network',
  useIpOrLocal: 'Use the printer\'s IP or a .local name',
  noPlate: 'The 3MF does not contain plate {plate} sliced (Metadata/plate_{plate}.gcode)',
};
