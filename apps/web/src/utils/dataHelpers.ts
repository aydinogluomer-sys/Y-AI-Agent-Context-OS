/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CodeFeedItem, SecretInput } from '../types';

export const CYAN_GLOW_COLOR = '#00d5ff';
export const CRIMSON_GLOW_COLOR = '#ef4444';
export const AMBER_GLOW_COLOR = '#f59e0b';
export const VOID_BLACK_COLOR = '#040406';

export const CODE_SNIPPETS = [
  'import { GoogleGenAI } from "@google/genai";',
  'const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });',
  'camera.dolly.translateZ(-0.005);',
  'await secrets.dissolve_into_stardust({ fadeOut: true });',
  'pub struct ObsidianGlassCorridor { depth: f64, nodes: Vec<AmberJunction> }',
  'matrix_context_os();',
  'fn render_vmatrix_fog(ctx: &mut CanvasRenderingContext2D) -> Result<(), Error>',
  'std::sync::Arc<tokio::sync::Mutex<CyberneticSystem>>',
  'const active_secret_hash = md5::compute(b"0x3A9F4E5B");',
  'gl::Uniform1f(loc_dof_range, config.focal_depth);',
  'export type ContextHash = string & { readonly __brand: unique symbol };',
  'node_junctions.forEach(node => node.pulse_radiate());',
  'class CyberneticContextMatrix extends React.Component<Props> {',
  'window.crypto.subtle.encrypt({ name: "AES-GCM" }, key, data);'
];

export const INITIAL_CODE_FEED: CodeFeedItem[] = [
  {
    id: 'feed-1',
    timestamp: '23:10:22.04',
    label: 'INTEGRATED CORE_OS',
    code: 'const sys = new CyberneticSystemContext();',
    status: 'COMPILED'
  },
  {
    id: 'feed-2',
    timestamp: '23:10:22.15',
    label: 'SYSTEM ENCRYPTION_KEY',
    code: 'const SECRET_ENCRYPT_PHRASE = "****************";',
    status: 'INFECTED'
  },
  {
    id: 'feed-3',
    timestamp: '23:10:22.42',
    label: 'SECTOR_44_MATRIX',
    code: 'corridor.projection_angle = Math.PI / 4;',
    status: 'COMPILED'
  },
  {
    id: 'feed-4',
    timestamp: '23:10:23.01',
    label: 'MACRO_LENS_SHADERS',
    code: 'const dofBlur = Math.min(10, Math.pow(distFromFocus, 2));',
    status: 'PENDING'
  }
];

export const INITIAL_SECRETS: SecretInput[] = [
  {
    id: 'sec-1',
    hash: '0x3D4E76AFA12B00C',
    status: 'STABLE',
    timestamp: '23:10:19.01'
  },
  {
    id: 'sec-2',
    hash: '0xF992E3F91A8E20B',
    status: 'DISSOLVING',
    timestamp: '23:10:22.10'
  },
  {
    id: 'sec-3',
    hash: '0x88A7CEB0284FCE0',
    status: 'STARDUST_EMBEDDED',
    timestamp: '23:10:22.55'
  }
];

export function generateRandomHash(): string {
  const chars = '0123456789ABCDEF';
  let hash = '0x';
  for (let i = 0; i < 16; i++) {
    hash += chars[Math.floor(Math.random() * chars.length)];
  }
  return hash;
}

export function generateRandomChar(): string {
  const codeAlphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789{}[]()<>+-*/%=!&|^~._;:#';
  return codeAlphabet[Math.floor(Math.random() * codeAlphabet.length)];
}
