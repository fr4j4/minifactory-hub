import type { Shape } from '../translate';
import type { es } from '../es';

export const api: Shape<typeof es['api']> = {
  onlyTheAdministratorCanExport: 'Only the administrator can export',
  noPermission: 'No permission',
  unknownExport: 'Unknown export',
  notAvailable: 'Not available',
  invalidPath: 'Invalid path',
  noPhotos: 'No photos',
  sliceNotAvailable: 'Slice not available',
  noGCode: 'No G-code',
  uploadNotFound: 'Upload not found',
  incompleteUpload: 'Incomplete upload',
  theChunkExceedsTheDeclared: 'The chunk exceeds the declared size',
  invalidData: 'Invalid data',
  theFileExceedsTheMaximum: 'The file exceeds the maximum of {mb} MB',
};
