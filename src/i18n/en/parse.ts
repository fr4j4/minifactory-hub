import type { Shape } from '../translate';
import type { es } from '../es';

export const parse: Shape<typeof es['parse']> = {
  mf3NoPlate: 'The 3MF has no plate {plate}',
  stlAscii: 'Invalid ASCII STL: the number of vertices is not a multiple of 3',
  objNoFaces: 'OBJ without faces',
  plyNoHeader: 'PLY without a header',
  mf3NoModel: '3MF without 3D/3dmodel.model',
  mf3NoGeometry: '3MF without geometry',
  amfNoGeometry: 'AMF without geometry',
  glbInvalid: 'Invalid GLB (only binary .glb is supported)',
  glbIncomplete: 'Incomplete GLB',
  glbNoTriangles: 'GLB without triangles',
  amfEmpty: 'Empty AMF',
};
