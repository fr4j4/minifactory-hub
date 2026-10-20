import {expect,it} from 'vitest';
// @ts-expect-error standalone JavaScript service
import {modelFilename,beginDownload,progressDownload,stalledDownload,downloadProgress} from '../../services/makerworld-browser/download-state.mjs';
const url='https://cdn.example.com/part.3mf?signature=private';
function session():any{return {startedDownload:true,profile:'3769534',phase:'requesting_download',downloadStartedAt:0,downloadFilename:'🍄 Gnome Mushroom – Cozy Autumn Decoration.3mf',downloadUrls:new Set([url]),downloads:new Map()};}
it('accepts Chromium generic filename only for the selected authorized resource',()=>{
  const s=session();expect(beginDownload(s,{guid:'one',suggestedFilename:'download',url},100)).toBe(true);
  expect(s.downloads.get('one').filename).toBe(s.downloadFilename);expect(s.phase).toBe('downloading');
  expect(beginDownload(s,{guid:'two',suggestedFilename:'download',url},100)).toBe(false);
  expect(beginDownload(session(),{guid:'other',suggestedFilename:'model.3mf',url:'https://other.example/model.3mf'})).toBe(false);
});
it('reports real bytes and completes without leaking the signed URL',()=>{
  const s=session();beginDownload(s,{guid:'one',suggestedFilename:'download',url},100);
  progressDownload(s,{guid:'one',receivedBytes:1024,totalBytes:2048,state:'inProgress'},5000,200);
  expect(downloadProgress(s)).toEqual({receivedBytes:1024,totalBytes:2048});expect(stalledDownload(s,300)).toBeUndefined();
  progressDownload(s,{guid:'one',receivedBytes:2048,totalBytes:2048,state:'completed'},5000,400);
  expect(s.phase).toBe('downloaded');expect(s.file.size).toBe(2048);expect(JSON.stringify(downloadProgress(s))).not.toContain('private');
});
it('detects a transfer that never starts and a stalled transfer',()=>{
  expect(stalledDownload(session(),21000)).toMatch(/no inició/);
  const s=session();beginDownload(s,{guid:'one',suggestedFilename:'download',url},0);
  expect(stalledDownload(s,91000)).toMatch(/90 segundos/);
});
it('does not remain downloading after cancellation or an oversized response',()=>{
  const s=session();beginDownload(s,{guid:'one',suggestedFilename:'download',url});
  progressDownload(s,{guid:'one',receivedBytes:0,totalBytes:100,state:'canceled'},5000);
  expect(s.phase).toBe('download_error');expect(s.startedDownload).toBe(false);expect(s.downloads.size).toBe(0);
  const large=session();beginDownload(large,{guid:'one',suggestedFilename:'download',url});
  expect(progressDownload(large,{guid:'one',receivedBytes:0,totalBytes:6000,state:'inProgress'},5000)).toBe('cancel');expect(large.phase).toBe('download_error');
});
it('normalizes metadata names and provides a 3MF fallback',()=>{
  expect(modelFilename('download','3769534')).toBe('makerworld-3769534.3mf');
  expect(modelFilename('../🍄 Gnome.3mf','3769534')).toBe('🍄 Gnome.3mf');
  expect(modelFilename('x'.repeat(500)+'.3mf','1').length).toBeLessThan(240);
});
