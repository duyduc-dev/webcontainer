# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: boot.spec.ts >> the angular playground scaffolds a real Angular app, installs it, and shows a real dev-server preview
- Location: e2e/boot.spec.ts:10:1

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('#terminal')
Timeout: 90000ms
- Expected substring  -   1
+ Received string     + 466

- [ng new] exit=0
+ warn tar     readonly ELEMENT_ARRAY_BUFFER: 0x8893;
+ npm warn tar     readonly ARRAY_BUFFER_BINDING: 0x8894;
+ npm warn tar     readonly ELEMENT_ARRAY_BUFFER_BINDING: 0x8895;
+ npm warn tar     readonly STREAM_DRAW: 0x88E0;
+ npm warn tar     readonly STATIC_DRAW: 0x88E4;
+ npm warn tar     readonly DYNAMIC_DRAW: 0x88E8;
+ npm warn tar     readonly BUFFER_SIZE: 0x8764;
+ npm warn tar     readonly BUFFER_USAGE: 0x8765;
+ npm warn tar     readonly CURRENT_VERTEX_ATTRIB: 0x8626;
+ npm warn tar     readonly FRONT: 0x0404;
+ npm warn tar     readonly BACK: 0x0405;
+ npm warn tar     readonly FRONT_AND_BACK: 0x0408;
+ npm warn tar     readonly CULL_FACE: 0x0B44;
+ npm warn tar     readonly BLEND: 0x0BE2;
+ npm warn tar     readonly DITHER: 0x0BD0;
+ npm warn tar     readonly STENCIL_TEST: 0x0B90;
+ npm warn tar     readonly DEPTH_TEST: 0x0B71;
+ npm warn tar     readonly SCISSOR_TEST: 0x0C11;
+ npm warn tar     readonly POLYGON_OFFSET_FILL: 0x8037;
+ npm warn tar     readonly SAMPLE_ALPHA_TO_COVERAGE: 0x809E;
+ npm warn tar     readonly SAMPLE_COVERAGE: 0x80A0;
+ npm warn tar     readonly NO_ERROR: 0;
+ npm warn tar     readonly INVALID_ENUM: 0x0500;
+ npm warn tar     readonly INVALID_VALUE: 0x0501;
+ npm warn tar     readonly INVALID_OPERATION: 0x0502;
+ npm warn tar     readonly OUT_OF_MEMORY: 0x0505;
+ npm warn tar     readonly CW: 0x0900;
+ npm warn tar     readonly CCW: 0x0901;
+ npm warn tar     readonly LINE_WIDTH: 0x0B21;
+ npm warn tar     readonly ALIASED_POINT_SIZE_RANGE: 0x846D;
+ npm warn tar     readonly ALIASED_LINE_WIDTH_RANGE: 0x846E;
+ npm warn tar     readonly CULL_FACE_MODE: 0x0B45;
+ npm warn tar     readonly FRONT_FACE: 0x0B46;
+ npm warn tar     readonly DEPTH_RANGE: 0x0B70;
+ npm warn tar     readonly DEPTH_WRITEMASK: 0x0B72;
+ npm warn tar     readonly DEPTH_CLEAR_VALUE: 0x0B73;
+ npm warn tar     readonly DEPTH_FUNC: 0x0B74;
+ npm warn tar     readonly STENCIL_CLEAR_VALUE: 0x0B91;
+ npm warn tar     readonly STENCIL_FUNC: 0x0B92;
+ npm warn tar     readonly STENCIL_FAIL: 0x0B94;
+ npm warn tar     readonly STENCIL_PASS_DEPTH_FAIL: 0x0B95;
+ npm warn tar     readonly STENCIL_PASS_DEPTH_PASS: 0x0B96;
+ npm warn tar     readonly STENCIL_REF: 0x0B97;
+ npm warn tar     readonly STENCIL_VALUE_MASK: 0x0B93;
+ npm warn tar     readonly STENCIL_WRITEMASK: 0x0B98;
+ npm warn tar     readonly STENCIL_BACK_FUNC: 0x8800;
+ npm warn tar     readonly STENCIL_BACK_FAIL: 0x8801;
+ npm warn tar     readonly STENCIL_BACK_PASS_DEPTH_FAIL: 0x8802;
+ npm warn tar     readonly STENCIL_BACK_PASS_DEPTH_PASS: 0x8803;
+ npm warn tar     readonly STENCIL_BACK_REF: 0x8CA3;
+ npm warn tar     readonly STENCIL_BACK_VALUE_MASK: 0x8CA4;
+ npm warn tar     readonly STENCIL_BACK_WRITEMASK: 0x8CA5;
+ npm warn tar     readonly VIEWPORT: 0x0BA2;
+ npm warn tar     readonly SCISSOR_BOX: 0x0C10;
+ npm warn tar     readonly COLOR_CLEAR_VALUE: 0x0C22;
+ npm warn tar     readonly COLOR_WRITEMASK: 0x0C23;
+ npm warn tar     readonly UNPACK_ALIGNMENT: 0x0CF5;
+ npm warn tar     readonly PACK_ALIGNMENT: 0x0D05;
+ npm warn tar     readonly MAX_TEXTURE_SIZE: 0x0D33;
+ npm warn tar     readonly MAX_VIEWPORT_DIMS: 0x0D3A;
+ npm warn tar     readonly SUBPIXEL_BITS: 0x0D50;
+ npm warn tar     readonly RED_BITS: 0x0D52;
+ npm warn tar     readonly GREEN_BITS: 0x0D53;
+ npm warn tar     readonly BLUE_BITS: 0x0D54;
+ npm warn tar     readonly ALPHA_BITS: 0x0D55;
+ npm warn tar     readonly DEPTH_BITS: 0x0D56;
+ npm warn tar     readonly STENCIL_BITS: 0x0D57;
+ npm warn tar     readonly POLYGON_OFFSET_UNITS: 0x2A00;
+ npm warn tar     readonly POLYGON_OFFSET_FACTOR: 0x8038;
+ npm warn tar     readonly TEXTURE_BINDING_2D: 0x8069;
+ npm warn tar     readonly SAMPLE_BUFFERS: 0x80A8;
+ npm warn tar     readonly SAMPLES: 0x80A9;
+ npm warn tar     readonly SAMPLE_COVERAGE_VALUE: 0x80AA;
+ npm warn tar     readonly SAMPLE_COVERAGE_INVERT: 0x80AB;
+ npm warn tar     readonly COMPRESSED_TEXTURE_FORMATS: 0x86A3;
+ npm warn tar     readonly DONT_CARE: 0x1100;
+ npm warn tar     readonly FASTEST: 0x1101;
+ npm warn tar     readonly NICEST: 0x1102;
+ npm warn tar     readonly GENERATE_MIPMAP_HINT: 0x8192;
+ npm warn tar     readonly BYTE: 0x1400;
+ npm warn tar     readonly UNSIGNED_BYTE: 0x1401;
+ npm warn tar     readonly SHORT: 0x1402;
+ npm warn tar     readonly UNSIGNED_SHORT: 0x1403;
+ npm warn tar     readonly INT: 0x1404;
+ npm warn tar     readonly UNSIGNED_INT: 0x1405;
+ npm warn tar     readonly FLOAT: 0x1406;
+ npm warn tar     readonly DEPTH_COMPONENT: 0x1902;
+ npm warn tar     readonly ALPHA: 0x1906;
+ npm warn tar     readonly RGB: 0x1907;
+ npm warn tar     readonly RGBA: 0x1908;
+ npm warn tar     readonly LUMINANCE: 0x1909;
+ npm warn tar     readonly LUMINANCE_ALPHA: 0x190A;
+ npm warn tar     readonly UNSIGNED_SHORT_4_4_4_4: 0x8033;
+ npm warn tar     readonly UNSIGNED_SHORT_5_5_5_1: 0x8034;
+ npm warn tar     readonly UNSIGNED_SHORT_5_6_5: 0x8363;
+ npm warn tar     readonly FRAGMENT_SHADER: 0x8B30;
+ npm warn tar     readonly VERTEX_SHADER: 0x8B31;
+ npm warn tar     readonly MAX_VERTEX_ATTRIBS: 0x8869;
+ npm warn tar     readonly MAX_VERTEX_UNIFORM_VECTORS: 0x8DFB;
+ npm warn tar     readonly MAX_VARYING_VECTORS: 0x8DFC;
+ npm warn tar     readonly MAX_COMBINED_TEXTURE_IMAGE_UNITS: 0x8B4D;
+ npm warn tar     readonly MAX_VERTEX_TEXTURE_IMAGE_UNITS: 0x8B4C;
+ npm warn tar     readonly MAX_TEXTURE_IMAGE_UNITS: 0x8872;
+ npm warn tar     readonly MAX_FRAGMENT_UNIFORM_VECTORS: 0x8DFD;
+ npm warn tar     readonly SHADER_TYPE: 0x8B4F;
+ npm warn tar     readonly DELETE_STATUS: 0x8B80;
+ npm warn tar     readonly LINK_STATUS: 0x8B82;
+ npm warn tar     readonly VALIDATE_STATUS: 0x8B83;
+ npm warn tar     readonly ATTACHED_SHADERS: 0x8B85;
+ npm warn tar     readonly ACTIVE_UNIFORMS: 0x8B86;
+ npm warn tar     readonly ACTIVE_ATTRIBUTES: 0x8B89;
+ npm warn tar     readonly SHADING_LANGUAGE_VERSION: 0x8B8C;
+ npm warn tar     readonly CURRENT_PROGRAM: 0x8B8D;
+ npm warn tar     readonly NEVER: 0x0200;
+ npm warn tar     readonly LESS: 0x0201;
+ npm warn tar     readonly EQUAL: 0x0202;
+ npm warn tar     readonly LEQUAL: 0x0203;
+ npm warn tar     readonly GREATER: 0x0204;
+ npm warn tar     readonly NOTEQUAL: 0x0205;
+ npm warn tar     readonly GEQUAL: 0x0206;
+ npm warn tar     readonly ALWAYS: 0x0207;
+ npm warn tar     readonly KEEP: 0x1E00;
+ npm warn tar     readonly REPLACE: 0x1E01;
+ npm warn tar     readonly INCR: 0x1E02;
+ npm warn tar     readonly DECR: 0x1E03;
+ npm warn tar     readonly INVERT: 0x150A;
+ npm warn tar     readonly INCR_WRAP: 0x8507;
+ npm warn tar     readonly DECR_WRAP: 0x8508;
+ npm warn tar     readonly VENDOR: 0x1F00;
+ npm warn tar     readonly RENDERER: 0x1F01;
+ npm warn tar     readonly VERSION: 0x1F02;
+ npm warn tar     readonly NEAREST: 0x2600;
+ npm warn tar     readonly LINEAR: 0x2601;
+ npm warn tar     readonly NEAREST_MIPMAP_NEAREST: 0x2700;
+ npm warn tar     readonly LINEAR_MIPMAP_NEAREST: 0x2701;
+ npm warn tar     readonly NEAREST_MIPMAP_LINEAR: 0x2702;
+ npm warn tar     readonly LINEAR_MIPMAP_LINEAR: 0x2703;
+ npm warn tar     readonly TEXTURE_MAG_FILTER: 0x2800;
+ npm warn tar     readonly TEXTURE_MIN_FILTER: 0x2801;
+ npm warn tar     readonly TEXTURE_WRAP_S: 0x2802;
+ npm warn tar     readonly TEXTURE_WRAP_T: 0x2803;
+ npm warn tar     readonly TEXTURE_2D: 0x0DE1;
+ npm warn tar     readonly TEXTURE: 0x1702;
+ npm warn tar     readonly TEXTURE_CUBE_MAP: 0x8513;
+ npm warn tar     readonly TEXTURE_BINDING_CUBE_MAP: 0x8514;
+ npm warn tar     readonly TEXTURE_CUBE_MAP_POSITIVE_X: 0x8515;
+ npm warn tar     readonly TEXTURE_CUBE_MAP_NEGATIVE_X: 0x8516;
+ npm warn tar     readonly TEXTURE_CUBE_MAP_POSITIVE_Y: 0x8517;
+ npm warn tar     readonly TEXTURE_CUBE_MAP_NEGATIVE_Y: 0x8518;
+ npm warn tar     readonly TEXTURE_CUBE_MAP_POSITIVE_Z: 0x8519;
+ npm warn tar     readonly TEXTURE_CUBE_MAP_NEGATIVE_Z: 0x851A;
+ npm warn tar     readonly MAX_CUBE_MAP_TEXTURE_SIZE: 0x851C;
+ npm warn tar     readonly TEXTURE0: 0x84C0;
+ npm warn tar     readonly TEXTURE1: 0x84C1;
+ npm warn tar     readonly TEXTURE2: 0x84C2;
+ npm warn tar     readonly TEXTURE3: 0x84C3;
+ npm warn tar     readonly TEXTURE4: 0x84C4;
+ npm warn tar     readonly TEXTURE5: 0x84C5;
+ npm warn tar     readonly TEXTURE6: 0x84C6;
+ npm warn tar     readonly TEXTURE7: 0x84C7;
+ npm warn tar     readonly TEXTURE8: 0x84C8;
+ npm warn tar     readonly TEXTURE9: 0x84C9;
+ npm warn tar     readonly TEXTURE10: 0x84CA;
+ npm warn tar     readonly TEXTURE11: 0x84CB;
+ npm warn tar     readonly TEXTURE12: 0x84CC;
+ npm warn tar     readonly TEXTURE13: 0x84CD;
+ npm warn tar     readonly TEXTURE14: 0x84CE;
+ npm warn tar     readonly TEXTURE15: 0x84CF;
+ npm warn tar     readonly TEXTURE16: 0x84D0;
+ npm warn tar     readonly TEXTURE17: 0x84D1;
+ npm warn tar     readonly TEXTURE18: 0x84D2;
+ npm warn tar     readonly TEXTURE19: 0x84D3;
+ npm warn tar     readonly TEXTURE20: 0x84D4;
+ npm warn tar     readonly TEXTURE21: 0x84D5;
+ npm warn tar     readonly TEXTURE22: 0x84D6;
+ npm warn tar     readonly TEXTURE23: 0x84D7;
+ npm warn tar     readonly TEXTURE24: 0x84D8;
+ npm warn tar     readonly TEXTURE25: 0x84D9;
+ npm warn tar     readonly TEXTURE26: 0x84DA;
+ npm warn tar     readonly TEXTURE27: 0x84DB;
+ npm warn tar     readonly TEXTURE28: 0x84DC;
+ npm warn tar     readonly TEXTURE29: 0x84DD;
+ npm warn tar     readonly TEXTURE30: 0x84DE;
+ npm warn tar     readonly TEXTURE31: 0x84DF;
+ npm warn tar     readonly ACTIVE_TEXTURE: 0x84E0;
+ npm warn tar     readonly REPEAT: 0x2901;
+ npm warn tar     readonly CLAMP_TO_EDGE: 0x812F;
+ npm warn tar     readonly MIRRORED_REPEAT: 0x8370;
+ npm warn tar     readonly FLOAT_VEC2: 0x8B50;
+ npm warn tar     readonly FLOAT_VEC3: 0x8B51;
+ npm warn tar     readonly FLOAT_VEC4: 0x8B52;
+ npm warn tar     readonly INT_VEC2: 0x8B53;
+ npm warn tar     readonly INT_VEC3: 0x8B54;
+ npm warn tar     readonly INT_VEC4: 0x8B55;
+ npm warn tar     readonly BOOL: 0x8B56;
+ npm warn tar     readonly BOOL_VEC2: 0x8B57;
+ npm warn tar     readonly BOOL_VEC3: 0x8B58;
+ npm warn tar     readonly BOOL_VEC4: 0x8B59;
+ npm warn tar     readonly FLOAT_MAT2: 0x8B5A;
+ npm warn tar     readonly FLOAT_MAT3: 0x8B5B;
+ npm warn tar     readonly FLOAT_MAT4: 0x8B5C;
+ npm warn tar     readonly SAMPLER_2D: 0x8B5E;
+ npm warn tar     readonly SAMPLER_CUBE: 0x8B60;
+ npm warn tar     readonly VERTEX_ATTRIB_ARRAY_ENABLED: 0x8622;
+ npm warn tar     readonly VERTEX_ATTRIB_ARRAY_SIZE: 0x8623;
+ npm warn tar     readonly VERTEX_ATTRIB_ARRAY_STRIDE: 0x8624;
+ npm warn tar     readonly VERTEX_ATTRIB_ARRAY_TYPE: 0x8625;
+ npm warn tar     readonly VERTEX_ATTRIB_ARRAY_NORMALIZED: 0x886A;
+ npm warn tar     readonly VERTEX_ATTRIB_ARRAY_POINTER: 0x8645;
+ npm warn tar     readonly VERTEX_ATTRIB_ARRAY_BUFFER_BINDING: 0x889F;
+ npm warn tar     readonly IMPLEMENTATION_COLOR_READ_TYPE: 0x8B9A;
+ npm warn tar     readonly IMPLEMENTATION_COLOR_READ_FORMAT: 0x8B9B;
+ npm warn tar     readonly COMPILE_STATUS: 0x8B81;
+ npm warn tar     readonly LOW_FLOAT: 0x8DF0;
+ npm warn tar     readonly MEDIUM_FLOAT: 0x8DF1;
+ npm warn tar     readonly HIGH_FLOAT: 0x8DF2;
+ npm warn tar     readonly LOW_INT: 0x8DF3;
+ npm warn tar     readonly MEDIUM_INT: 0x8DF4;
+ npm warn tar     readonly HIGH_INT: 0x8DF5;
+ npm warn tar     readonly FRAMEBUFFER: 0x8D40;
+ npm warn tar     readonly RENDERBUFFER: 0x8D41;
+ npm warn tar     readonly RGBA4: 0x8056;
+ npm warn tar     readonly RGB5_A1: 0x8057;
+ npm warn tar     readonly RGBA8: 0x8058;
+ npm warn tar     readonly RGB565: 0x8D62;
+ npm warn tar     readonly DEPTH_COMPONENT16: 0x81A5;
+ npm warn tar     readonly STENCIL_INDEX8: 0x8D48;
+ npm warn tar     readonly DEPTH_STENCIL: 0x84F9;
+ npm warn tar     readonly RENDERBUFFER_WIDTH: 0x8D42;
+ npm warn tar     readonly RENDERBUFFER_HEIGHT: 0x8D43;
+ npm warn tar     readonly RENDERBUFFER_INTERNAL_FORMAT: 0x8D44;
+ npm warn tar     readonly RENDERBUFFER_RED_SIZE: 0x8D50;
+ npm warn tar     readonly RENDERBUFFER_GREEN_SIZE: 0x8D51;
+ npm warn tar     readonly RENDERBUFFER_BLUE_SIZE: 0x8D52;
+ npm warn tar     readonly RENDERBUFFER_ALPHA_SIZE: 0x8D53;
+ npm warn tar     readonly RENDERBUFFER_DEPTH_SIZE: 0x8D54;
+ npm warn tar     readonly RENDERBUFFER_STENCIL_SIZE: 0x8D55;
+ npm warn tar     readonly FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE: 0x8CD0;
+ npm warn tar     readonly FRAMEBUFFER_ATTACHMENT_OBJECT_NAME: 0x8CD1;
+ npm warn tar     readonly FRAMEBUFFER_ATTACHMENT_TEXTURE_LEVEL: 0x8CD2;
+ npm warn tar     readonly FRAMEBUFFER_ATTACHMENT_TEXTURE_CUBE_MAP_FACE: 0x8CD3;
+ npm warn tar     readonly COLOR_ATTACHMENT0: 0x8CE0;
+ npm warn tar     readonly DEPTH_ATTACHMENT: 0x8D00;
+ npm warn tar     readonly STENCIL_ATTACHMENT: 0x8D20;
+ npm warn tar     readonly DEPTH_STENCIL_ATTACHMENT: 0x821A;
+ npm warn tar     readonly NONE: 0;
+ npm warn tar     readonly FRAMEBUFFER_COMPLETE: 0x8CD5;
+ npm warn tar     readonly FRAMEBUFFER_INCOMPLETE_ATTACHMENT: 0x8CD6;
+ npm warn tar     readonly FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT: 0x8CD7;
+ npm warn tar     readonly FRAMEBUFFER_INCOMPLETE_DIMENSIONS: 0x8CD9;
+ npm warn tar     readonly FRAMEBUFFER_UNSUPPORTED: 0x8CDD;
+ npm warn tar     readonly FRAMEBUFFER_BINDING: 0x8CA6;
+ npm warn tar     readonly RENDERBUFFER_BINDING: 0x8CA7;
+ npm warn tar     readonly MAX_RENDERBUFFER_SIZE: 0x84E8;
+ npm warn tar     readonly INVALID_FRAMEBUFFER_OPERATION: 0x0506;
+ npm warn tar     readonly UNPACK_FLIP_Y_WEBGL: 0x9240;
+ npm warn tar     readonly UNPACK_PREMULTIPLY_ALPHA_WEBGL: 0x9241;
+ npm warn tar     readonly CONTEXT_LOST_WEBGL: 0x9242;
+ npm warn tar     readonly UNPACK_COLORSPACE_CONVERSION_WEBGL: 0x9243;
+ npm warn tar     readonly BROWSER_DEFAULT_WEBGL: 0x9244;
+ npm warn tar };
+ npm warn tar
+ npm warn tar interface WebGLRenderingContextBase {
+ npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/canvas) */
+ npm warn tar     readonly canvas: HTMLCanvasElement | OffscreenCanvas;
+ npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGL2RenderingContext/drawingBufferColorSpace) */
+ npm warn tar     drawingBufferColorSpace: PredefinedColorSpace;
+ npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/drawingBufferHeight) */
+ npm warn tar     readonly drawingBufferHeight: GLsizei;
+ npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/drawingBufferWidth) */
+ npm warn tar     readonly drawingBufferWidth: GLsizei;
+ npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGL2RenderingContext/unpackColorSpace) */
+ npm warn tar     unpackColorSpace: PredefinedColorSpace;
+ npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/activeTexture) */
+ npm warn tar     activeTexture(texture: GLenum): void;
+ npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/attachShader) */
+ npm warn tar     attachShader(program: WebGLProgram, shader: WebGLShader): void;
+ npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/bindAttribLocation) */
+ npm warn tar     bindAttribLocation(program: WebGLProgram, index: GLuint, name: string): void;
+ npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/bindBuffer) */
+ npm warn tar     bindBuffer(target: GLenum, buffer: WebGLBuffer | null): void;
+ npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/bindFramebuffer) */
+ npm warn tar     bindFramebuffer(target: GLenum, framebuffer: WebGLFramebuffer | null): void;
+ npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/bindRenderbuffer) */
+ npm warn tar     bindRenderbuffer(target: GLenum, renderbuffer: WebGLRenderbuffer | null): void;
+ npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/bindTexture) */
+ npm warn tar     bindTexture(target: GLenum, texture: WebGLTexture | null): void;
+ npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/blendColor) */
+ npm warn tar     blendColor(red: GLclampf, green: GLclampf, blue: GLclampf, alpha: GLclampf): void;
+ npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/blendEquation) */
+ npm warn tar     blendEquation(mode: GLenum): void;
+ npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/blendEquationSeparate) */
+ npm warn tar     blendEquationSeparate(modeRGB: GLenum, modeAlpha: GLenum): void;
+ npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/blendFunc) */
+ npm warn tar     blendFunc(sfactor: GLenum, dfactor: GLenum): void;
+ npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/blendFuncSeparate) */
+ npm warn tar     blendFuncSeparate(srcRGB: GLenum, dstRGB: GLenum, srcAlpha: GLenum, dstAlpha: GLenum): void;
+ npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/checkFramebufferStatus) */
+ npm warn tar     checkFramebufferStatus(target: GLenum): GLenum;
+ npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/clear) */
+ npm warn tar     clear(mask: GLbitfield): void;
+ npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/clearColor) */
+ npm warn tar     clearColor(red: GLclampf, green: GLclampf, blue: GLclampf, alpha: GLclampf): void;
+ npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/clearDepth) */
+ npm warn tar     clearDepth(depth: GLclampf): void;
+ npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/clearStencil) */
+ npm warn tar     clearStencil(s: GLint): void;
+ npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/colorMask) */
+ npm warn tar     colorMask(red: GLboolean, green: GLboolean, blue: GLboolean, alpha: GLboolean): void;
+ npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/compileShader) */
+ npm warn tar     compileShader(shader: WebGLShader): void;
+ npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/copyTexImage2D) */
+ npm warn tar     copyTexImage2D(target: GLenum, level: GLint, internalformat: GLenum, x: GLint, y: GLint, width: GLsizei, height: GLsizei, border: GLint): void;
+ npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/copyTexSubImage2D) */
+ npm warn tar     copyTexSubImage2D(target: GLenum, level: GLint, xoffset: GLint, yoffset: GLint, x: GLint, y: GLint, width: GLsizei, height: GLsizei): void;
+ npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/createBuffer) */
+ npm warn tar     createBuffer(): WebGLBuffer;
+ npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/createFramebuffer) */
+ npm warn tar     createFramebuffer(): WebGLFramebuffer;
+ npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/createProgram) */
+ npm warn tar     createProgram(): WebGLProgram;
+ npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/createRenderbuffer) */
+ npm warn tar     createRenderbuffer(): WebGLRenderbuffer;
+ npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/createShader) */
+ npm warn tar     createShader(type: GLenum): WebGLShader | null;
+ npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/createTexture) */
+ npm warn tar     createTexture(): WebGLTexture;
+ npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/cullFace) */
+ npm warn tar     cullFace(mode: GLenum): void;
+ npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/deleteBuffer) */
+ npm warn tar     deleteBuffer(buffer: WebGLBuffer | null): void;
+ npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/deleteFramebuffer) */
+ npm warn tar     deleteFramebuffer(framebuffer: WebGLFramebuffer | null): void;
+ npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/deleteProgram) */
+ npm warn tar     deleteProgram(program: WebGLProgram | null): void;
+ npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/deleteRenderbuffer) */
+ npm warn tar     deleteRenderbuffer(renderbuffer: WebGLRenderbuffer | null): void;
+ npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/deleteShader) */
+ npm warn tar     deleteShader(shader: WebGLShader | null): void;
+ npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/deleteTexture) */
+ npm warn tar     deleteTexture(texture: WebGLTexture | null): void;
+ npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/depthFunc) */
+ npm warn tar     depthFunc(func: GLenum): void;
+ npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/depthMask) */
+ npm warn tar     depthMask(flag: GLboolean): void;
+ npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/depthRange) */
+ npm warn tar     depthRange(zNear: GLclampf, zFar: GLclampf): void;
+ npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/detachShader) */
+ npm warn tar     detachShader(program: WebGLProgram, shader: WebGLShader): void;
+ npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/disable) */
+ npm warn tar     disable(cap: GLenum): void;
+ npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/disableVertexAttribArray) */
+ npm warn tar     disableVertexAttribArray(index: GLuint): void;
+ npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/drawArrays) */
+ npm warn tar     drawArrays(mode: GLenum, first: GLint, count: GLsizei): void;
+ npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/drawElements) */
+ npm warn tar     drawElements(mode: GLenum, count: GLsizei, type: GLenum, offset: GLintptr): void;
+ npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/enable) */
+ npm warn tar     enable(cap: GLenum): void;
+ npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/enableVertexAttribArray) */
+ npm warn tar     enableVertexAttribArray(index: GLuint): void;
+ npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/finish) */
+ npm warn tar     finish(): void;
+ npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/flush) */
+ npm warn tar     flush(): void;
+ npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/framebufferRenderbuffer) */
+ npm warn tar     framebufferRenderbuffer(target: GLenum, attachment: GLenum, renderbuffertarget: GLenum, renderbuffer: WebGLRenderbuffer | null): void;
+ npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/framebufferTexture2D) */
+ npm warn tar     framebufferTexture2D(target: GLenum, attachment: GLenum, textarget: GLenum, texture: WebGLTexture | null, level: GLint): void;
+ npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/frontFace) */
+ npm warn tar     frontFace(mode: GLenum): void;
+ npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/generateMipmap) */
+ npm warn tar     generateMipmap(target: GLenum): void;
+ npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/getActiveAttrib) */
+ npm warn tar     getActiveAttrib(program: WebGLProgram, index: GLuint): WebGLActiveInfo | null;
+ npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/getActiveUniform) */
+ npm warn tar     getActiveUniform(program: WebGLProgram, index: GLuint): WebGLActiveInfo | null;
+ npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/getAttachedShaders) */
+ npm warn tar     getAttachedShaders(program: WebGLProgram): WebGLShader[] | null;
+ npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/getAttribLocation) */
+ npm warn tar     getAttribLocation(program: WebGLProgram, name: string): GLint;
+ npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/getBufferParameter) */
+ npm warn tar     getBufferParameter(target: GLenum, pname: GLenum): any;
+ npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/getContextAttributes) */
+ npm warn tar     getContextAttributes(): WebGLContextAttributes | null;
+ npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/getError) */
+ npm warn tar     getError(): GLenum;
+ npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/getExtension) */
+ npm warn tar     getExtension(name: string): any;
+ npm warn tar     getExtension(extensionName: "ANGLE_instanced_arrays"): ANGLE_instanced_arrays | null;
+ npm warn tar     getExtension(extensionName: "EXT_blend_minmax"): EXT_blend_minmax | null;
+ npm warn tar     getExtension(extensionName: "EXT_color_buffer_float"): EXT_color_buffer_float | null;
+ npm warn tar     getExtension(extensionName: "EXT_color_buffer_half_float"): EXT_color_buffer_half_float | null;
+ npm warn tar     getExtension(extensionName: "EXT_float_blend"): EXT_float_blend | null;
+ npm warn tar     getExtension(extensionName: "EXT_frag_depth"): EXT_frag_depth | null;
+ npm warn tar     getExtension(extensionName: "EXT_sRGB"): EXT_sRGB | null;
+ npm warn tar     getExtension(extensionName: "EXT_shader_texture_lod"): EXT_shader_texture_lod | null;
+ npm warn tar     getExtension(extensionName: "EXT_texture_compression_bptc"): EXT_texture_compression_bptc | null;
+ npm warn tar     getExtension(extensionName: "EXT_texture_compression_rgtc"): EXT_texture_compression_rgtc | null;
+ npm warn tar     getExtension(extensionName: "EXT_texture_filter_anisotropic"): EXT_texture_filter_anisotropic | null;
+ npm warn tar     getExtension(extensionName: "KHR_parallel_shader_compile"): KHR_parallel_shader_compile | null;
+ npm warn tar     getExtension(extensionName: "OES_element_index_uint"): OES_element_index_uint | null;
+ npm warn tar     getExtension(extensionName: "OES_fbo_render_mipmap"): OES_fbo_render_mipmap | null;
+ npm warn tar     getExtension(extensionName: "OES_standard_derivatives"): OES_standard_derivatives | null;
+ npm warn tar     getExtension(extensionName: "OES_texture_float"): OES_texture_float | null;
+ npm warn tar     getExtension(extensionName: "OES_texture_float_linear"): OES_texture_float_linear | null;
+ npm warn tar     getExtension(extensionName: "OES_texture_half_float"): OES_texture_half_float | null;
+ npm warn tar     getExtension(extensionName: "OES_texture_half_float_linear"): OES_texture_half_float_linear | null;
+ npm warn tar     getExtension(extensionName: "OES_vertex_array_object"): OES_vertex_array_object | null;
+ npm warn tar     getExtension(extensionName: "OVR_multiview2"): OVR_multiview2 | null;
+ npm warn tar     getExtension(extensionName: "WEBGL_color_buffer_float"): WEBGL_color_buffer_float | null;
+ npm warn tar     getExtension(extensionName: "WEBGL_compressed_texture_astc"): WEBGL_compressed_texture_astc | null;
+ npm warn tar     getExtension(extensionName: "WEBGL_compressed_texture_etc"): WEBGL_compressed_texture_etc | null;
+ npm warn tar     getExtension(extensionName: "WEBGL_compressed_texture_etc1"): WEBGL_compressed_texture_etc1 | null;
+ npm warn tar     getExtension(extensionName: "WEBGL_compressed_texture_pvrtc"): WEBGL_compressed_texture_pvrtc | null;
+ npm warn tar     getExtension(extensionName: "WEBGL_compressed_texture_s3tc"): WEBGL_compressed_texture_s3tc | null;
+ npm warn tar     getExtension(extensionName: "WEBGL_compressed_texture_s3tc_srgb"): WEBGL_compressed_texture_s3tc_srgb | null;
+ npm warn tar     getExtension(extensionName: "WEBGL_debug_renderer_info"): WEBGL_debug_renderer_info | null;
+ npm warn tar     getExtension(extensionName: "WEBGL_debug_shaders"): WEBGL_debug_shaders | null;
+ npm warn tar     getExtension(extensionName: "WEBGL_depth_texture"): WEBGL_depth_texture | null;
+ npm warn tar     getExtension(extensionName: "WEBGL_draw_buffers"): WEBGL_draw_buffers | null;
+ npm warn tar     getExtension(extensionName: "WEBGL_lose_context"): WEBGL_lose_context | null;
+ npm warn tar     getExtension(extensionName: "WEBGL_multi_draw"): WEBGL_multi_draw | null;
+ npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/getFramebufferAttachmentParameter) */
+ npm warn tar     getFramebufferAttachmentParameter(target: GLenum, attachment: GLenum, pname: GLenum): any;
+ npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/getParameter) */
+ npm warn tar     getParameter(pname: GLenum): any;
+ npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/getProgramInfoLog) */
+ npm warn tar     getProgramInfoLog(program: WebGLProgram): string | null;
+ npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/getProgramParameter) */
+ npm warn tar     getProgramParameter(program: WebGLProgram, pname: GLenum): any;
+ npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/getRenderbufferParameter) */
+ npm warn tar     getRenderbufferParameter(target: GLenum, pname: GLenum): any;
+ npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/getShaderInfoLog) */
+ npm warn tar     getShaderInfoLog(shader: WebGLShader): string | null;
+ npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/getShaderParameter) */
+ npm warn tar     getShaderParameter(shader: WebGLShader, pname: GLenum): any;
+ npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/getShaderPrecisionFormat) */
+ npm warn tar     getShaderPrecisionFormat(shadertype: GLenum, precisiontype: GLenum): WebGLShaderPrecisionFormat | null;
+ npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/getShaderSourcD^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@
+
+ [ng new] 
+ > npx
+ > create my-ng-app --skip-install --skip-git --defaults
+
+
+ [ng new] Error: child_process.spawnSync is not implemented yet (needs a synchronous kernel bridge)
+     at http://localhost:5184/@fs/home/ddn9hc/workspace/duck/webcontainer/packages/core/dist/workers/process/worker.js:7346:11
+     at eval (dwc://module/home/user/.npm/_npx/5b5a2fdb7ee15b24/node_modules/@angular/create/src/index.js:25:54)
+     at loadModule (http://localhost:5184/@fs/home/ddn9hc/workspace/duck/webcontainer/packages/core/dist/workers/process/worker.js:22680:7)
+     at Object.run (http://localhost:5184/@fs/home/ddn9hc/workspace/duck/webcontainer/packages/core/dist/workers/process/worker.js:22702:14)
+     at boot (http://localhost:5184/@fs/home/ddn9hc/workspace/duck/webcontainer/packages/core/dist/workers/process/worker.js:23317:24)
+     at self.onmessage (http://localhost:5184/@fs/home/ddn9hc/workspace/duck/webcontainer/packages/core/dist/workers/process/worker.js:23341:35)
+
+ [ng new] npm error code 1
+
+ [ng new] npm error path /
+
+ [ng new] npm error command failed
+
+ [ng new] npm error command sh -c create my-ng-app --skip-install --skip-git --defaults
+
+ [ng new] 
+ [ng new] 
+ [ng new] exit=1
+

Call log:
  - Expect "toContainText" with timeout 90000ms
  - waiting for locator('#terminal')
    11 × locator resolved to <div id="terminal"></div>
       - unexpected value ""
    4 × locator resolved to <div id="terminal">npm loaded result: 10.9.2 1935↵[ng new] scaffoldi…</div>
      - unexpected value "npm loaded result: 10.9.2 1935
[ng new] scaffolding a real Angular app...
"
    5 × locator resolved to <div id="terminal">npm loaded result: 10.9.2 1935↵[ng new] scaffoldi…</div>
      - unexpected value "npm loaded result: 10.9.2 1935
[ng new] scaffolding a real Angular app...
[ng new] [vite] connected.

"
    146 × locator resolved to <div id="terminal">npm loaded result: 10.9.2 1935↵[ng new] scaffoldi…</div>
        - unexpected value "npm loaded result: 10.9.2 1935
[ng new] scaffolding a real Angular app...
[ng new] [vite] connected.

[ng new] npm warn exec The following package was not found and will be installed: @angular/create@22.1.8

"
    5 × locator resolved to <div id="terminal">pm warn tar     readonly SRC_ALPHA: 0x0302;↵npm w…</div>
      - unexpected value "pm warn tar     readonly SRC_ALPHA: 0x0302;
npm warn tar     readonly ONE_MINUS_SRC_ALPHA: 0x0303;
npm warn tar     readonly DST_ALPHA: 0x0304;
npm warn tar     readonly ONE_MINUS_DST_ALPHA: 0x0305;
npm warn tar     readonly DST_COLOR: 0x0306;
npm warn tar     readonly ONE_MINUS_DST_COLOR: 0x0307;
npm warn tar     readonly SRC_ALPHA_SATURATE: 0x0308;
npm warn tar     readonly FUNC_ADD: 0x8006;
npm warn tar     readonly BLEND_EQUATION: 0x8009;
npm warn tar     readonly BLEND_EQUATION_RGB: 0x8009;
npm warn tar     readonly BLEND_EQUATION_ALPHA: 0x883D;
npm warn tar     readonly FUNC_SUBTRACT: 0x800A;
npm warn tar     readonly FUNC_REVERSE_SUBTRACT: 0x800B;
npm warn tar     readonly BLEND_DST_RGB: 0x80C8;
npm warn tar     readonly BLEND_SRC_RGB: 0x80C9;
npm warn tar     readonly BLEND_DST_ALPHA: 0x80CA;
npm warn tar     readonly BLEND_SRC_ALPHA: 0x80CB;
npm warn tar     readonly CONSTANT_COLOR: 0x8001;
npm warn tar     readonly ONE_MINUS_CONSTANT_COLOR: 0x8002;
npm warn tar     readonly CONSTANT_ALPHA: 0x8003;
npm warn tar     readonly ONE_MINUS_CONSTANT_ALPHA: 0x8004;
npm warn tar     readonly BLEND_COLOR: 0x8005;
npm warn tar     readonly ARRAY_BUFFER: 0x8892;
npm warn tar     readonly ELEMENT_ARRAY_BUFFER: 0x8893;
npm warn tar     readonly ARRAY_BUFFER_BINDING: 0x8894;
npm warn tar     readonly ELEMENT_ARRAY_BUFFER_BINDING: 0x8895;
npm warn tar     readonly STREAM_DRAW: 0x88E0;
npm warn tar     readonly STATIC_DRAW: 0x88E4;
npm warn tar     readonly DYNAMIC_DRAW: 0x88E8;
npm warn tar     readonly BUFFER_SIZE: 0x8764;
npm warn tar     readonly BUFFER_USAGE: 0x8765;
npm warn tar     readonly CURRENT_VERTEX_ATTRIB: 0x8626;
npm warn tar     readonly FRONT: 0x0404;
npm warn tar     readonly BACK: 0x0405;
npm warn tar     readonly FRONT_AND_BACK: 0x0408;
npm warn tar     readonly CULL_FACE: 0x0B44;
npm warn tar     readonly BLEND: 0x0BE2;
npm warn tar     readonly DITHER: 0x0BD0;
npm warn tar     readonly STENCIL_TEST: 0x0B90;
npm warn tar     readonly DEPTH_TEST: 0x0B71;
npm warn tar     readonly SCISSOR_TEST: 0x0C11;
npm warn tar     readonly POLYGON_OFFSET_FILL: 0x8037;
npm warn tar     readonly SAMPLE_ALPHA_TO_COVERAGE: 0x809E;
npm warn tar     readonly SAMPLE_COVERAGE: 0x80A0;
npm warn tar     readonly NO_ERROR: 0;
npm warn tar     readonly INVALID_ENUM: 0x0500;
npm warn tar     readonly INVALID_VALUE: 0x0501;
npm warn tar     readonly INVALID_OPERATION: 0x0502;
npm warn tar     readonly OUT_OF_MEMORY: 0x0505;
npm warn tar     readonly CW: 0x0900;
npm warn tar     readonly CCW: 0x0901;
npm warn tar     readonly LINE_WIDTH: 0x0B21;
npm warn tar     readonly ALIASED_POINT_SIZE_RANGE: 0x846D;
npm warn tar     readonly ALIASED_LINE_WIDTH_RANGE: 0x846E;
npm warn tar     readonly CULL_FACE_MODE: 0x0B45;
npm warn tar     readonly FRONT_FACE: 0x0B46;
npm warn tar     readonly DEPTH_RANGE: 0x0B70;
npm warn tar     readonly DEPTH_WRITEMASK: 0x0B72;
npm warn tar     readonly DEPTH_CLEAR_VALUE: 0x0B73;
npm warn tar     readonly DEPTH_FUNC: 0x0B74;
npm warn tar     readonly STENCIL_CLEAR_VALUE: 0x0B91;
npm warn tar     readonly STENCIL_FUNC: 0x0B92;
npm warn tar     readonly STENCIL_FAIL: 0x0B94;
npm warn tar     readonly STENCIL_PASS_DEPTH_FAIL: 0x0B95;
npm warn tar     readonly STENCIL_PASS_DEPTH_PASS: 0x0B96;
npm warn tar     readonly STENCIL_REF: 0x0B97;
npm warn tar     readonly STENCIL_VALUE_MASK: 0x0B93;
npm warn tar     readonly STENCIL_WRITEMASK: 0x0B98;
npm warn tar     readonly STENCIL_BACK_FUNC: 0x8800;
npm warn tar     readonly STENCIL_BACK_FAIL: 0x8801;
npm warn tar     readonly STENCIL_BACK_PASS_DEPTH_FAIL: 0x8802;
npm warn tar     readonly STENCIL_BACK_PASS_DEPTH_PASS: 0x8803;
npm warn tar     readonly STENCIL_BACK_REF: 0x8CA3;
npm warn tar     readonly STENCIL_BACK_VALUE_MASK: 0x8CA4;
npm warn tar     readonly STENCIL_BACK_WRITEMASK: 0x8CA5;
npm warn tar     readonly VIEWPORT: 0x0BA2;
npm warn tar     readonly SCISSOR_BOX: 0x0C10;
npm warn tar     readonly COLOR_CLEAR_VALUE: 0x0C22;
npm warn tar     readonly COLOR_WRITEMASK: 0x0C23;
npm warn tar     readonly UNPACK_ALIGNMENT: 0x0CF5;
npm warn tar     readonly PACK_ALIGNMENT: 0x0D05;
npm warn tar     readonly MAX_TEXTURE_SIZE: 0x0D33;
npm warn tar     readonly MAX_VIEWPORT_DIMS: 0x0D3A;
npm warn tar     readonly SUBPIXEL_BITS: 0x0D50;
npm warn tar     readonly RED_BITS: 0x0D52;
npm warn tar     readonly GREEN_BITS: 0x0D53;
npm warn tar     readonly BLUE_BITS: 0x0D54;
npm warn tar     readonly ALPHA_BITS: 0x0D55;
npm warn tar     readonly DEPTH_BITS: 0x0D56;
npm warn tar     readonly STENCIL_BITS: 0x0D57;
npm warn tar     readonly POLYGON_OFFSET_UNITS: 0x2A00;
npm warn tar     readonly POLYGON_OFFSET_FACTOR: 0x8038;
npm warn tar     readonly TEXTURE_BINDING_2D: 0x8069;
npm warn tar     readonly SAMPLE_BUFFERS: 0x80A8;
npm warn tar     readonly SAMPLES: 0x80A9;
npm warn tar     readonly SAMPLE_COVERAGE_VALUE: 0x80AA;
npm warn tar     readonly SAMPLE_COVERAGE_INVERT: 0x80AB;
npm warn tar     readonly COMPRESSED_TEXTURE_FORMATS: 0x86A3;
npm warn tar     readonly DONT_CARE: 0x1100;
npm warn tar     readonly FASTEST: 0x1101;
npm warn tar     readonly NICEST: 0x1102;
npm warn tar     readonly GENERATE_MIPMAP_HINT: 0x8192;
npm warn tar     readonly BYTE: 0x1400;
npm warn tar     readonly UNSIGNED_BYTE: 0x1401;
npm warn tar     readonly SHORT: 0x1402;
npm warn tar     readonly UNSIGNED_SHORT: 0x1403;
npm warn tar     readonly INT: 0x1404;
npm warn tar     readonly UNSIGNED_INT: 0x1405;
npm warn tar     readonly FLOAT: 0x1406;
npm warn tar     readonly DEPTH_COMPONENT: 0x1902;
npm warn tar     readonly ALPHA: 0x1906;
npm warn tar     readonly RGB: 0x1907;
npm warn tar     readonly RGBA: 0x1908;
npm warn tar     readonly LUMINANCE: 0x1909;
npm warn tar     readonly LUMINANCE_ALPHA: 0x190A;
npm warn tar     readonly UNSIGNED_SHORT_4_4_4_4: 0x8033;
npm warn tar     readonly UNSIGNED_SHORT_5_5_5_1: 0x8034;
npm warn tar     readonly UNSIGNED_SHORT_5_6_5: 0x8363;
npm warn tar     readonly FRAGMENT_SHADER: 0x8B30;
npm warn tar     readonly VERTEX_SHADER: 0x8B31;
npm warn tar     readonly MAX_VERTEX_ATTRIBS: 0x8869;
npm warn tar     readonly MAX_VERTEX_UNIFORM_VECTORS: 0x8DFB;
npm warn tar     readonly MAX_VARYING_VECTORS: 0x8DFC;
npm warn tar     readonly MAX_COMBINED_TEXTURE_IMAGE_UNITS: 0x8B4D;
npm warn tar     readonly MAX_VERTEX_TEXTURE_IMAGE_UNITS: 0x8B4C;
npm warn tar     readonly MAX_TEXTURE_IMAGE_UNITS: 0x8872;
npm warn tar     readonly MAX_FRAGMENT_UNIFORM_VECTORS: 0x8DFD;
npm warn tar     readonly SHADER_TYPE: 0x8B4F;
npm warn tar     readonly DELETE_STATUS: 0x8B80;
npm warn tar     readonly LINK_STATUS: 0x8B82;
npm warn tar     readonly VALIDATE_STATUS: 0x8B83;
npm warn tar     readonly ATTACHED_SHADERS: 0x8B85;
npm warn tar     readonly ACTIVE_UNIFORMS: 0x8B86;
npm warn tar     readonly ACTIVE_ATTRIBUTES: 0x8B89;
npm warn tar     readonly SHADING_LANGUAGE_VERSION: 0x8B8C;
npm warn tar     readonly CURRENT_PROGRAM: 0x8B8D;
npm warn tar     readonly NEVER: 0x0200;
npm warn tar     readonly LESS: 0x0201;
npm warn tar     readonly EQUAL: 0x0202;
npm warn tar     readonly LEQUAL: 0x0203;
npm warn tar     readonly GREATER: 0x0204;
npm warn tar     readonly NOTEQUAL: 0x0205;
npm warn tar     readonly GEQUAL: 0x0206;
npm warn tar     readonly ALWAYS: 0x0207;
npm warn tar     readonly KEEP: 0x1E00;
npm warn tar     readonly REPLACE: 0x1E01;
npm warn tar     readonly INCR: 0x1E02;
npm warn tar     readonly DECR: 0x1E03;
npm warn tar     readonly INVERT: 0x150A;
npm warn tar     readonly INCR_WRAP: 0x8507;
npm warn tar     readonly DECR_WRAP: 0x8508;
npm warn tar     readonly VENDOR: 0x1F00;
npm warn tar     readonly RENDERER: 0x1F01;
npm warn tar     readonly VERSION: 0x1F02;
npm warn tar     readonly NEAREST: 0x2600;
npm warn tar     readonly LINEAR: 0x2601;
npm warn tar     readonly NEAREST_MIPMAP_NEAREST: 0x2700;
npm warn tar     readonly LINEAR_MIPMAP_NEAREST: 0x2701;
npm warn tar     readonly NEAREST_MIPMAP_LINEAR: 0x2702;
npm warn tar     readonly LINEAR_MIPMAP_LINEAR: 0x2703;
npm warn tar     readonly TEXTURE_MAG_FILTER: 0x2800;
npm warn tar     readonly TEXTURE_MIN_FILTER: 0x2801;
npm warn tar     readonly TEXTURE_WRAP_S: 0x2802;
npm warn tar     readonly TEXTURE_WRAP_T: 0x2803;
npm warn tar     readonly TEXTURE_2D: 0x0DE1;
npm warn tar     readonly TEXTURE: 0x1702;
npm warn tar     readonly TEXTURE_CUBE_MAP: 0x8513;
npm warn tar     readonly TEXTURE_BINDING_CUBE_MAP: 0x8514;
npm warn tar     readonly TEXTURE_CUBE_MAP_POSITIVE_X: 0x8515;
npm warn tar     readonly TEXTURE_CUBE_MAP_NEGATIVE_X: 0x8516;
npm warn tar     readonly TEXTURE_CUBE_MAP_POSITIVE_Y: 0x8517;
npm warn tar     readonly TEXTURE_CUBE_MAP_NEGATIVE_Y: 0x8518;
npm warn tar     readonly TEXTURE_CUBE_MAP_POSITIVE_Z: 0x8519;
npm warn tar     readonly TEXTURE_CUBE_MAP_NEGATIVE_Z: 0x851A;
npm warn tar     readonly MAX_CUBE_MAP_TEXTURE_SIZE: 0x851C;
npm warn tar     readonly TEXTURE0: 0x84C0;
npm warn tar     readonly TEXTURE1: 0x84C1;
npm warn tar     readonly TEXTURE2: 0x84C2;
npm warn tar     readonly TEXTURE3: 0x84C3;
npm warn tar     readonly TEXTURE4: 0x84C4;
npm warn tar     readonly TEXTURE5: 0x84C5;
npm warn tar     readonly TEXTURE6: 0x84C6;
npm warn tar     readonly TEXTURE7: 0x84C7;
npm warn tar     readonly TEXTURE8: 0x84C8;
npm warn tar     readonly TEXTURE9: 0x84C9;
npm warn tar     readonly TEXTURE10: 0x84CA;
npm warn tar     readonly TEXTURE11: 0x84CB;
npm warn tar     readonly TEXTURE12: 0x84CC;
npm warn tar     readonly TEXTURE13: 0x84CD;
npm warn tar     readonly TEXTURE14: 0x84CE;
npm warn tar     readonly TEXTURE15: 0x84CF;
npm warn tar     readonly TEXTURE16: 0x84D0;
npm warn tar     readonly TEXTURE17: 0x84D1;
npm warn tar     readonly TEXTURE18: 0x84D2;
npm warn tar     readonly TEXTURE19: 0x84D3;
npm warn tar     readonly TEXTURE20: 0x84D4;
npm warn tar     readonly TEXTURE21: 0x84D5;
npm warn tar     readonly TEXTURE22: 0x84D6;
npm warn tar     readonly TEXTURE23: 0x84D7;
npm warn tar     readonly TEXTURE24: 0x84D8;
npm warn tar     readonly TEXTURE25: 0x84D9;
npm warn tar     readonly TEXTURE26: 0x84DA;
npm warn tar     readonly TEXTURE27: 0x84DB;
npm warn tar     readonly TEXTURE28: 0x84DC;
npm warn tar     readonly TEXTURE29: 0x84DD;
npm warn tar     readonly TEXTURE30: 0x84DE;
npm warn tar     readonly TEXTURE31: 0x84DF;
npm warn tar     readonly ACTIVE_TEXTURE: 0x84E0;
npm warn tar     readonly REPEAT: 0x2901;
npm warn tar     readonly CLAMP_TO_EDGE: 0x812F;
npm warn tar     readonly MIRRORED_REPEAT: 0x8370;
npm warn tar     readonly FLOAT_VEC2: 0x8B50;
npm warn tar     readonly FLOAT_VEC3: 0x8B51;
npm warn tar     readonly FLOAT_VEC4: 0x8B52;
npm warn tar     readonly INT_VEC2: 0x8B53;
npm warn tar     readonly INT_VEC3: 0x8B54;
npm warn tar     readonly INT_VEC4: 0x8B55;
npm warn tar     readonly BOOL: 0x8B56;
npm warn tar     readonly BOOL_VEC2: 0x8B57;
npm warn tar     readonly BOOL_VEC3: 0x8B58;
npm warn tar     readonly BOOL_VEC4: 0x8B59;
npm warn tar     readonly FLOAT_MAT2: 0x8B5A;
npm warn tar     readonly FLOAT_MAT3: 0x8B5B;
npm warn tar     readonly FLOAT_MAT4: 0x8B5C;
npm warn tar     readonly SAMPLER_2D: 0x8B5E;
npm warn tar     readonly SAMPLER_CUBE: 0x8B60;
npm warn tar     readonly VERTEX_ATTRIB_ARRAY_ENABLED: 0x8622;
npm warn tar     readonly VERTEX_ATTRIB_ARRAY_SIZE: 0x8623;
npm warn tar     readonly VERTEX_ATTRIB_ARRAY_STRIDE: 0x8624;
npm warn tar     readonly VERTEX_ATTRIB_ARRAY_TYPE: 0x8625;
npm warn tar     readonly VERTEX_ATTRIB_ARRAY_NORMALIZED: 0x886A;
npm warn tar     readonly VERTEX_ATTRIB_ARRAY_POINTER: 0x8645;
npm warn tar     readonly VERTEX_ATTRIB_ARRAY_BUFFER_BINDING: 0x889F;
npm warn tar     readonly IMPLEMENTATION_COLOR_READ_TYPE: 0x8B9A;
npm warn tar     readonly IMPLEMENTATION_COLOR_READ_FORMAT: 0x8B9B;
npm warn tar     readonly COMPILE_STATUS: 0x8B81;
npm warn tar     readonly LOW_FLOAT: 0x8DF0;
npm warn tar     readonly MEDIUM_FLOAT: 0x8DF1;
npm warn tar     readonly HIGH_FLOAT: 0x8DF2;
npm warn tar     readonly LOW_INT: 0x8DF3;
npm warn tar     readonly MEDIUM_INT: 0x8DF4;
npm warn tar     readonly HIGH_INT: 0x8DF5;
npm warn tar     readonly FRAMEBUFFER: 0x8D40;
npm warn tar     readonly RENDERBUFFER: 0x8D41;
npm warn tar     readonly RGBA4: 0x8056;
npm warn tar     readonly RGB5_A1: 0x8057;
npm warn tar     readonly RGBA8: 0x8058;
npm warn tar     readonly RGB565: 0x8D62;
npm warn tar     readonly DEPTH_COMPONENT16: 0x81A5;
npm warn tar     readonly STENCIL_INDEX8: 0x8D48;
npm warn tar     readonly DEPTH_STENCIL: 0x84F9;
npm warn tar     readonly RENDERBUFFER_WIDTH: 0x8D42;
npm warn tar     readonly RENDERBUFFER_HEIGHT: 0x8D43;
npm warn tar     readonly RENDERBUFFER_INTERNAL_FORMAT: 0x8D44;
npm warn tar     readonly RENDERBUFFER_RED_SIZE: 0x8D50;
npm warn tar     readonly RENDERBUFFER_GREEN_SIZE: 0x8D51;
npm warn tar     readonly RENDERBUFFER_BLUE_SIZE: 0x8D52;
npm warn tar     readonly RENDERBUFFER_ALPHA_SIZE: 0x8D53;
npm warn tar     readonly RENDERBUFFER_DEPTH_SIZE: 0x8D54;
npm warn tar     readonly RENDERBUFFER_STENCIL_SIZE: 0x8D55;
npm warn tar     readonly FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE: 0x8CD0;
npm warn tar     readonly FRAMEBUFFER_ATTACHMENT_OBJECT_NAME: 0x8CD1;
npm warn tar     readonly FRAMEBUFFER_ATTACHMENT_TEXTURE_LEVEL: 0x8CD2;
npm warn tar     readonly FRAMEBUFFER_ATTACHMENT_TEXTURE_CUBE_MAP_FACE: 0x8CD3;
npm warn tar     readonly COLOR_ATTACHMENT0: 0x8CE0;
npm warn tar     readonly DEPTH_ATTACHMENT: 0x8D00;
npm warn tar     readonly STENCIL_ATTACHMENT: 0x8D20;
npm warn tar     readonly DEPTH_STENCIL_ATTACHMENT: 0x821A;
npm warn tar     readonly NONE: 0;
npm warn tar     readonly FRAMEBUFFER_COMPLETE: 0x8CD5;
npm warn tar     readonly FRAMEBUFFER_INCOMPLETE_ATTACHMENT: 0x8CD6;
npm warn tar     readonly FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT: 0x8CD7;
npm warn tar     readonly FRAMEBUFFER_INCOMPLETE_DIMENSIONS: 0x8CD9;
npm warn tar     readonly FRAMEBUFFER_UNSUPPORTED: 0x8CDD;
npm warn tar     readonly FRAMEBUFFER_BINDING: 0x8CA6;
npm warn tar     readonly RENDERBUFFER_BINDING: 0x8CA7;
npm warn tar     readonly MAX_RENDERBUFFER_SIZE: 0x84E8;
npm warn tar     readonly INVALID_FRAMEBUFFER_OPERATION: 0x0506;
npm warn tar     readonly UNPACK_FLIP_Y_WEBGL: 0x9240;
npm warn tar     readonly UNPACK_PREMULTIPLY_ALPHA_WEBGL: 0x9241;
npm warn tar     readonly CONTEXT_LOST_WEBGL: 0x9242;
npm warn tar     readonly UNPACK_COLORSPACE_CONVERSION_WEBGL: 0x9243;
npm warn tar     readonly BROWSER_DEFAULT_WEBGL: 0x9244;
npm warn tar };
npm warn tar
npm warn tar interface WebGLRenderingContextBase {
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/canvas) */
npm warn tar     readonly canvas: HTMLCanvasElement | OffscreenCanvas;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGL2RenderingContext/drawingBufferColorSpace) */
npm warn tar     drawingBufferColorSpace: PredefinedColorSpace;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/drawingBufferHeight) */
npm warn tar     readonly drawingBufferHeight: GLsizei;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/drawingBufferWidth) */
npm warn tar     readonly drawingBufferWidth: GLsizei;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGL2RenderingContext/unpackColorSpace) */
npm warn tar     unpackColorSpace: PredefinedColorSpace;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/activeTexture) */
npm warn tar     activeTexture(texture: GLenum): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/attachShader) */
npm warn tar     attachShader(program: WebGLProgram, shader: WebGLShader): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/bindAttribLocation) */
npm warn tar     bindAttribLocation(program: WebGLProgram, index: GLuint, name: string): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/bindBuffer) */
npm warn tar     bindBuffer(target: GLenum, buffer: WebGLBuffer | null): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/bindFramebuffer) */
npm warn tar     bindFramebuffer(target: GLenum, framebuffer: WebGLFramebuffer | null): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/bindRenderbuffer) */
npm warn tar     bindRenderbuffer(target: GLenum, renderbuffer: WebGLRenderbuffer | null): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/bindTexture) */
npm warn tar     bindTexture(target: GLenum, texture: WebGLTexture | null): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/blendColor) */
npm warn tar     blendColor(red: GLclampf, green: GLclampf, blue: GLclampf, alpha: GLclampf): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/blendEquation) */
npm warn tar     blendEquation(mode: GLenum): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/blendEquationSeparate) */
npm warn tar     blendEquationSeparate(modeRGB: GLenum, modeAlpha: GLenum): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/blendFunc) */
npm warn tar     blendFunc(sfactor: GLenum, dfactor: GLenum): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/blendFuncSeparate) */
npm warn tar     blendFuncSeparate(srcRGB: GLenum, dstRGB: GLenum, srcAlpha: GLenum, dstAlpha: GLenum): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/checkFramebufferStatus) */
npm warn tar     checkFramebufferStatus(target: GLenum): GLenum;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/clear) */
npm warn tar     clear(mask: GLbitfield): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/clearColor) */
npm warn tar     clearColor(red: GLclampf, green: GLclampf, blue: GLclampf, alpha: GLclampf): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/clearDepth) */
npm warn tar     clearDepth(depth: GLclampf): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/clearStencil) */
npm warn tar     clearStencil(s: GLint): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/colorMask) */
npm warn tar     colorMask(red: GLboolean, green: GLboolean, blue: GLboolean, alpha: GLboolean): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/compileShader) */
npm warn tar     compileShader(shader: WebGLShader): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/copyTexImage2D) */
npm warn tar     copyTexImage2D(target: GLenum, level: GLint, internalformat: GLenum, x: GLint, y: GLint, width: GLsizei, height: GLsizei, border: GLint): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/copyTexSubImage2D) */
npm warn tar     copyTexSubImage2D(target: GLenum, level: GLint, xoffset: GLint, yoffset: GLint, x: GLint, y: GLint, width: GLsizei, height: GLsizei): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/createBuffer) */
npm warn tar     createBuffer(): WebGLBuffer;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/createFramebuffer) */
npm warn tar     createFramebuffer(): WebGLFramebuffer;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/createProgram) */
npm warn tar     createProgram(): WebGLProgram;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/createRenderbuffer) */
npm warn tar     createRenderbuffer(): WebGLRenderbuffer;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/createShader) */
npm warn tar     createShader(type: GLenum): WebGLShader | null;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/createTexture) */
npm warn tar     createTexture(): WebGLTexture;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/cullFace) */
npm warn tar     cullFace(mode: GLenum): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/deleteBuffer) */
npm warn tar     deleteBuffer(buffer: WebGLBuffer | null): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/deleteFramebuffer) */
npm warn tar     deleteFramebuffer(framebuffer: WebGLFramebuffer | null): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/deleteProgram) */
npm warn tar     deleteProgram(program: WebGLProgram | null): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/deleteRenderbuffer) */
npm warn tar     deleteRenderbuffer(renderbuffer: WebGLRenderbuffer | null): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/deleteShader) */
npm warn tar     deleteShader(shader: WebGLShader | null): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/deleteTexture) */
npm warn tar     deleteTexture(texture: WebGLTexture | null): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/depthFunc) */
npm warn tar     depthFunc(func: GLenum): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/depthMask) */
npm warn tar     depthMask(flag: GLboolean): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/depthRange) */
npm warn tar     depthRange(zNear: GLclampf, zFar: GLclampf): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/detachShader) */
npm warn tar     detachShader(program: WebGLProgram, shader: WebGLShader): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/disable) */
npm warn tar     disable(cap: GLenum): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/disableVertexAttribArray) */
npm warn tar     disableVertexAttribArray(index: GLuint): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/drawArrays) */
npm warn tar     drawArrays(mode: GLenum, first: GLint, count: GLsizei): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/drawElements) */
npm warn tar     drawElements(mode: GLenum, count: GLsizei, type: GLenum, offset: GLintptr): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/enable) */
npm warn tar     enable(cap: GLenum): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/enableVertexAttribArray) */
npm warn tar     enableVertexAttribArray(index: GLuint): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/finish) */
npm warn tar     finish(): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/flush) */
npm warn tar     flush(): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/framebufferRenderbuffer) */
npm warn tar     framebufferRenderbuffer(target: GLenum, attachment: GLenum, renderbuffertarget: GLenum, renderbuffer: WebGLRenderbuffer | null): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/framebufferTexture2D) */
npm warn tar     framebufferTexture2D(target: GLenum, attachment: GLenum, textarget: GLenum, texture: WebGLTexture | null, level: GLint): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/frontFace) */
npm warn tar     frontFace(mode: GLenum): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/generateMipmap) */
npm warn tar     generateMipmap(target: GLenum): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/getActiveAttrib) */
npm warn tar     getActiveAttrib(program: WebGLProgram, index: GLuint): WebGLActiveInfo | null;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/getActiveUniform) */
npm warn tar     getActiveUniform(program: WebGLProgram, index: GLuint): WebGLActiveInfo | null;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/getAttachedShaders) */
npm warn tar     getAttachedShaders(program: WebGLProgram): WebGLShader[] | null;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/getAttribLocation) */
npm warn tar     getAttribLocation(program: WebGLProgram, name: string): GLint;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/getBufferParameter) */
npm warn tar     getBufferParameter(target: GLenum, pname: GLenum): any;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/getContextAttributes) */
npm warn tar     getContextAttributes(): WebGLContextAttributes | null;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/getError) */
npm warn tar     getError(): GLenum;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/getExtension) */
npm warn tar     getExtension(name: string): any;
npm warn tar     getExtension(extensionName: "ANGLE_instanced_arrays"): ANGLE_instanced_arrays | null;
npm warn tar     getExtension(extensionName: "EXT_blend_minmax"): EXT_blend_minmax | null;
npm warn tar     getExtension(extensionName: "EXT_color_buffer_float"): EXT_color_buffer_float | null;
npm warn tar     getExtension(extensionName: "EXT_color_buffer_half_float"): EXT_color_buffer_half_float | null;
npm warn tar     getExtension(extensionName: "EXT_float_blend"): EXT_float_blend | null;
npm warn tar     getExtension(extensionName: "EXT_frag_depth"): EXT_frag_depth | null;
npm warn tar     getExtension(extensionName: "EXT_sRGB"): EXT_sRGB | null;
npm warn tar     getExtension(extensionName: "EXT_shader_texture_lod"): EXT_shader_texture_lod | null;
npm warn tar     getExtension(extensionName: "EXT_texture_compression_bptc"): EXT_texture_compression_bptc | null;
npm warn tar     getExtension(extensionName: "EXT_texture_compression_rgtc"): EXT_texture_compression_rgtc | null;
npm warn tar     getExtension(extensionName: "EXT_texture_filter_anisotropic"): EXT_texture_filter_anisotropic | null;
npm warn tar     getExtension(extensionName: "KHR_parallel_shader_compile"): KHR_parallel_shader_compile | null;
npm warn tar     getExtension(extensionName: "OES_element_index_uint"): OES_element_index_uint | null;
npm warn tar     getExtension(extensionName: "OES_fbo_render_mipmap"): OES_fbo_render_mipmap | null;
npm warn tar     getExtension(extensionName: "OES_standard_derivatives"): OES_standard_derivatives | null;
npm warn tar     getExtension(extensionName: "OES_texture_float"): OES_texture_float | null;
npm warn tar     getExtension(extensionName: "OES_texture_float_linear"): OES_texture_float_linear | null;
npm warn tar     getExtension(extensionName: "OES_texture_half_float"): OES_texture_half_float | null;
npm warn tar     getExtension(extensionName: "OES_texture_half_float_linear"): OES_texture_half_float_linear | null;
npm warn tar     getExtension(extensionName: "OES_vertex_array_object"): OES_vertex_array_object | null;
npm warn tar     getExtension(extensionName: "OVR_multiview2"): OVR_multiview2 | null;
npm warn tar     getExtension(extensionName: "WEBGL_color_buffer_float"): WEBGL_color_buffer_float | null;
npm warn tar     getExtension(extensionName: "WEBGL_compressed_texture_astc"): WEBGL_compressed_texture_astc | null;
npm warn tar     getExtension(extensionName: "WEBGL_compressed_texture_etc"): WEBGL_compressed_texture_etc | null;
npm warn tar     getExtension(extensionName: "WEBGL_compressed_texture_etc1"): WEBGL_compressed_texture_etc1 | null;
npm warn tar     getExtension(extensionName: "WEBGL_compressed_texture_pvrtc"): WEBGL_compressed_texture_pvrtc | null;
npm warn tar     getExtension(extensionName: "WEBGL_compressed_texture_s3tc"): WEBGL_compressed_texture_s3tc | null;
npm warn tar     getExtension(extensionName: "WEBGL_compressed_texture_s3tc_srgb"): WEBGL_compressed_texture_s3tc_srgb | null;
npm warn tar     getExtension(extensionName: "WEBGL_debug_renderer_info"): WEBGL_debug_renderer_info | null;
npm warn tar     getExtension(extensionName: "WEBGL_debug_shaders"): WEBGL_debug_shaders | null;
npm warn tar     getExtension(extensionName: "WEBGL_depth_texture"): WEBGL_depth_texture | null;
npm warn tar     getExtension(extensionName: "WEBGL_draw_buffers"): WEBGL_draw_buffers | null;
npm warn tar     getExtension(extensionName: "WEBGL_lose_context"): WEBGL_lose_context | null;
npm warn tar     getExtension(extensionName: "WEBGL_multi_draw"): WEBGL_multi_draw | null;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/getFramebufferAttachmentParameter) */
npm warn tar     getFramebufferAttachmentParameter(target: GLenum, attachment: GLenum, pname: GLenum): any;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/getParameter) */
npm warn tar     getParameter(pname: GLenum): any;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/getProgramInfoLog) */
npm warn tar     getProgramInfoLog(program: WebGLProgram): string | null;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/getProgramParameter) */
npm warn tar     getProgramParameter(program: WebGLProgram, pname: GLenum): any;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/getRenderbufferParameter) */
npm warn tar     getRenderbufferParameter(target: GLenum, pname: GLenum): any;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/getShaderInfoLog) */
npm warn tar     getShaderInfoLog(shader: WebGLShader): string | null;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/getShaderParameter) */
npm warn tar     getShaderParameter(shader: WebGLShader, pname: GLenum): any;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/getShaderPrecisionFormat) */
npm warn tar     getShaderPrecisionFormat(shadertype: GLenum, precisiontype: GLenum): WebGLShaderPrecisionFormat | null;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/getShaderSourcD^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@

"
    12 × locator resolved to <div id="terminal">warn tar     readonly ELEMENT_ARRAY_BUFFER: 0x889…</div>
       - unexpected value "warn tar     readonly ELEMENT_ARRAY_BUFFER: 0x8893;
npm warn tar     readonly ARRAY_BUFFER_BINDING: 0x8894;
npm warn tar     readonly ELEMENT_ARRAY_BUFFER_BINDING: 0x8895;
npm warn tar     readonly STREAM_DRAW: 0x88E0;
npm warn tar     readonly STATIC_DRAW: 0x88E4;
npm warn tar     readonly DYNAMIC_DRAW: 0x88E8;
npm warn tar     readonly BUFFER_SIZE: 0x8764;
npm warn tar     readonly BUFFER_USAGE: 0x8765;
npm warn tar     readonly CURRENT_VERTEX_ATTRIB: 0x8626;
npm warn tar     readonly FRONT: 0x0404;
npm warn tar     readonly BACK: 0x0405;
npm warn tar     readonly FRONT_AND_BACK: 0x0408;
npm warn tar     readonly CULL_FACE: 0x0B44;
npm warn tar     readonly BLEND: 0x0BE2;
npm warn tar     readonly DITHER: 0x0BD0;
npm warn tar     readonly STENCIL_TEST: 0x0B90;
npm warn tar     readonly DEPTH_TEST: 0x0B71;
npm warn tar     readonly SCISSOR_TEST: 0x0C11;
npm warn tar     readonly POLYGON_OFFSET_FILL: 0x8037;
npm warn tar     readonly SAMPLE_ALPHA_TO_COVERAGE: 0x809E;
npm warn tar     readonly SAMPLE_COVERAGE: 0x80A0;
npm warn tar     readonly NO_ERROR: 0;
npm warn tar     readonly INVALID_ENUM: 0x0500;
npm warn tar     readonly INVALID_VALUE: 0x0501;
npm warn tar     readonly INVALID_OPERATION: 0x0502;
npm warn tar     readonly OUT_OF_MEMORY: 0x0505;
npm warn tar     readonly CW: 0x0900;
npm warn tar     readonly CCW: 0x0901;
npm warn tar     readonly LINE_WIDTH: 0x0B21;
npm warn tar     readonly ALIASED_POINT_SIZE_RANGE: 0x846D;
npm warn tar     readonly ALIASED_LINE_WIDTH_RANGE: 0x846E;
npm warn tar     readonly CULL_FACE_MODE: 0x0B45;
npm warn tar     readonly FRONT_FACE: 0x0B46;
npm warn tar     readonly DEPTH_RANGE: 0x0B70;
npm warn tar     readonly DEPTH_WRITEMASK: 0x0B72;
npm warn tar     readonly DEPTH_CLEAR_VALUE: 0x0B73;
npm warn tar     readonly DEPTH_FUNC: 0x0B74;
npm warn tar     readonly STENCIL_CLEAR_VALUE: 0x0B91;
npm warn tar     readonly STENCIL_FUNC: 0x0B92;
npm warn tar     readonly STENCIL_FAIL: 0x0B94;
npm warn tar     readonly STENCIL_PASS_DEPTH_FAIL: 0x0B95;
npm warn tar     readonly STENCIL_PASS_DEPTH_PASS: 0x0B96;
npm warn tar     readonly STENCIL_REF: 0x0B97;
npm warn tar     readonly STENCIL_VALUE_MASK: 0x0B93;
npm warn tar     readonly STENCIL_WRITEMASK: 0x0B98;
npm warn tar     readonly STENCIL_BACK_FUNC: 0x8800;
npm warn tar     readonly STENCIL_BACK_FAIL: 0x8801;
npm warn tar     readonly STENCIL_BACK_PASS_DEPTH_FAIL: 0x8802;
npm warn tar     readonly STENCIL_BACK_PASS_DEPTH_PASS: 0x8803;
npm warn tar     readonly STENCIL_BACK_REF: 0x8CA3;
npm warn tar     readonly STENCIL_BACK_VALUE_MASK: 0x8CA4;
npm warn tar     readonly STENCIL_BACK_WRITEMASK: 0x8CA5;
npm warn tar     readonly VIEWPORT: 0x0BA2;
npm warn tar     readonly SCISSOR_BOX: 0x0C10;
npm warn tar     readonly COLOR_CLEAR_VALUE: 0x0C22;
npm warn tar     readonly COLOR_WRITEMASK: 0x0C23;
npm warn tar     readonly UNPACK_ALIGNMENT: 0x0CF5;
npm warn tar     readonly PACK_ALIGNMENT: 0x0D05;
npm warn tar     readonly MAX_TEXTURE_SIZE: 0x0D33;
npm warn tar     readonly MAX_VIEWPORT_DIMS: 0x0D3A;
npm warn tar     readonly SUBPIXEL_BITS: 0x0D50;
npm warn tar     readonly RED_BITS: 0x0D52;
npm warn tar     readonly GREEN_BITS: 0x0D53;
npm warn tar     readonly BLUE_BITS: 0x0D54;
npm warn tar     readonly ALPHA_BITS: 0x0D55;
npm warn tar     readonly DEPTH_BITS: 0x0D56;
npm warn tar     readonly STENCIL_BITS: 0x0D57;
npm warn tar     readonly POLYGON_OFFSET_UNITS: 0x2A00;
npm warn tar     readonly POLYGON_OFFSET_FACTOR: 0x8038;
npm warn tar     readonly TEXTURE_BINDING_2D: 0x8069;
npm warn tar     readonly SAMPLE_BUFFERS: 0x80A8;
npm warn tar     readonly SAMPLES: 0x80A9;
npm warn tar     readonly SAMPLE_COVERAGE_VALUE: 0x80AA;
npm warn tar     readonly SAMPLE_COVERAGE_INVERT: 0x80AB;
npm warn tar     readonly COMPRESSED_TEXTURE_FORMATS: 0x86A3;
npm warn tar     readonly DONT_CARE: 0x1100;
npm warn tar     readonly FASTEST: 0x1101;
npm warn tar     readonly NICEST: 0x1102;
npm warn tar     readonly GENERATE_MIPMAP_HINT: 0x8192;
npm warn tar     readonly BYTE: 0x1400;
npm warn tar     readonly UNSIGNED_BYTE: 0x1401;
npm warn tar     readonly SHORT: 0x1402;
npm warn tar     readonly UNSIGNED_SHORT: 0x1403;
npm warn tar     readonly INT: 0x1404;
npm warn tar     readonly UNSIGNED_INT: 0x1405;
npm warn tar     readonly FLOAT: 0x1406;
npm warn tar     readonly DEPTH_COMPONENT: 0x1902;
npm warn tar     readonly ALPHA: 0x1906;
npm warn tar     readonly RGB: 0x1907;
npm warn tar     readonly RGBA: 0x1908;
npm warn tar     readonly LUMINANCE: 0x1909;
npm warn tar     readonly LUMINANCE_ALPHA: 0x190A;
npm warn tar     readonly UNSIGNED_SHORT_4_4_4_4: 0x8033;
npm warn tar     readonly UNSIGNED_SHORT_5_5_5_1: 0x8034;
npm warn tar     readonly UNSIGNED_SHORT_5_6_5: 0x8363;
npm warn tar     readonly FRAGMENT_SHADER: 0x8B30;
npm warn tar     readonly VERTEX_SHADER: 0x8B31;
npm warn tar     readonly MAX_VERTEX_ATTRIBS: 0x8869;
npm warn tar     readonly MAX_VERTEX_UNIFORM_VECTORS: 0x8DFB;
npm warn tar     readonly MAX_VARYING_VECTORS: 0x8DFC;
npm warn tar     readonly MAX_COMBINED_TEXTURE_IMAGE_UNITS: 0x8B4D;
npm warn tar     readonly MAX_VERTEX_TEXTURE_IMAGE_UNITS: 0x8B4C;
npm warn tar     readonly MAX_TEXTURE_IMAGE_UNITS: 0x8872;
npm warn tar     readonly MAX_FRAGMENT_UNIFORM_VECTORS: 0x8DFD;
npm warn tar     readonly SHADER_TYPE: 0x8B4F;
npm warn tar     readonly DELETE_STATUS: 0x8B80;
npm warn tar     readonly LINK_STATUS: 0x8B82;
npm warn tar     readonly VALIDATE_STATUS: 0x8B83;
npm warn tar     readonly ATTACHED_SHADERS: 0x8B85;
npm warn tar     readonly ACTIVE_UNIFORMS: 0x8B86;
npm warn tar     readonly ACTIVE_ATTRIBUTES: 0x8B89;
npm warn tar     readonly SHADING_LANGUAGE_VERSION: 0x8B8C;
npm warn tar     readonly CURRENT_PROGRAM: 0x8B8D;
npm warn tar     readonly NEVER: 0x0200;
npm warn tar     readonly LESS: 0x0201;
npm warn tar     readonly EQUAL: 0x0202;
npm warn tar     readonly LEQUAL: 0x0203;
npm warn tar     readonly GREATER: 0x0204;
npm warn tar     readonly NOTEQUAL: 0x0205;
npm warn tar     readonly GEQUAL: 0x0206;
npm warn tar     readonly ALWAYS: 0x0207;
npm warn tar     readonly KEEP: 0x1E00;
npm warn tar     readonly REPLACE: 0x1E01;
npm warn tar     readonly INCR: 0x1E02;
npm warn tar     readonly DECR: 0x1E03;
npm warn tar     readonly INVERT: 0x150A;
npm warn tar     readonly INCR_WRAP: 0x8507;
npm warn tar     readonly DECR_WRAP: 0x8508;
npm warn tar     readonly VENDOR: 0x1F00;
npm warn tar     readonly RENDERER: 0x1F01;
npm warn tar     readonly VERSION: 0x1F02;
npm warn tar     readonly NEAREST: 0x2600;
npm warn tar     readonly LINEAR: 0x2601;
npm warn tar     readonly NEAREST_MIPMAP_NEAREST: 0x2700;
npm warn tar     readonly LINEAR_MIPMAP_NEAREST: 0x2701;
npm warn tar     readonly NEAREST_MIPMAP_LINEAR: 0x2702;
npm warn tar     readonly LINEAR_MIPMAP_LINEAR: 0x2703;
npm warn tar     readonly TEXTURE_MAG_FILTER: 0x2800;
npm warn tar     readonly TEXTURE_MIN_FILTER: 0x2801;
npm warn tar     readonly TEXTURE_WRAP_S: 0x2802;
npm warn tar     readonly TEXTURE_WRAP_T: 0x2803;
npm warn tar     readonly TEXTURE_2D: 0x0DE1;
npm warn tar     readonly TEXTURE: 0x1702;
npm warn tar     readonly TEXTURE_CUBE_MAP: 0x8513;
npm warn tar     readonly TEXTURE_BINDING_CUBE_MAP: 0x8514;
npm warn tar     readonly TEXTURE_CUBE_MAP_POSITIVE_X: 0x8515;
npm warn tar     readonly TEXTURE_CUBE_MAP_NEGATIVE_X: 0x8516;
npm warn tar     readonly TEXTURE_CUBE_MAP_POSITIVE_Y: 0x8517;
npm warn tar     readonly TEXTURE_CUBE_MAP_NEGATIVE_Y: 0x8518;
npm warn tar     readonly TEXTURE_CUBE_MAP_POSITIVE_Z: 0x8519;
npm warn tar     readonly TEXTURE_CUBE_MAP_NEGATIVE_Z: 0x851A;
npm warn tar     readonly MAX_CUBE_MAP_TEXTURE_SIZE: 0x851C;
npm warn tar     readonly TEXTURE0: 0x84C0;
npm warn tar     readonly TEXTURE1: 0x84C1;
npm warn tar     readonly TEXTURE2: 0x84C2;
npm warn tar     readonly TEXTURE3: 0x84C3;
npm warn tar     readonly TEXTURE4: 0x84C4;
npm warn tar     readonly TEXTURE5: 0x84C5;
npm warn tar     readonly TEXTURE6: 0x84C6;
npm warn tar     readonly TEXTURE7: 0x84C7;
npm warn tar     readonly TEXTURE8: 0x84C8;
npm warn tar     readonly TEXTURE9: 0x84C9;
npm warn tar     readonly TEXTURE10: 0x84CA;
npm warn tar     readonly TEXTURE11: 0x84CB;
npm warn tar     readonly TEXTURE12: 0x84CC;
npm warn tar     readonly TEXTURE13: 0x84CD;
npm warn tar     readonly TEXTURE14: 0x84CE;
npm warn tar     readonly TEXTURE15: 0x84CF;
npm warn tar     readonly TEXTURE16: 0x84D0;
npm warn tar     readonly TEXTURE17: 0x84D1;
npm warn tar     readonly TEXTURE18: 0x84D2;
npm warn tar     readonly TEXTURE19: 0x84D3;
npm warn tar     readonly TEXTURE20: 0x84D4;
npm warn tar     readonly TEXTURE21: 0x84D5;
npm warn tar     readonly TEXTURE22: 0x84D6;
npm warn tar     readonly TEXTURE23: 0x84D7;
npm warn tar     readonly TEXTURE24: 0x84D8;
npm warn tar     readonly TEXTURE25: 0x84D9;
npm warn tar     readonly TEXTURE26: 0x84DA;
npm warn tar     readonly TEXTURE27: 0x84DB;
npm warn tar     readonly TEXTURE28: 0x84DC;
npm warn tar     readonly TEXTURE29: 0x84DD;
npm warn tar     readonly TEXTURE30: 0x84DE;
npm warn tar     readonly TEXTURE31: 0x84DF;
npm warn tar     readonly ACTIVE_TEXTURE: 0x84E0;
npm warn tar     readonly REPEAT: 0x2901;
npm warn tar     readonly CLAMP_TO_EDGE: 0x812F;
npm warn tar     readonly MIRRORED_REPEAT: 0x8370;
npm warn tar     readonly FLOAT_VEC2: 0x8B50;
npm warn tar     readonly FLOAT_VEC3: 0x8B51;
npm warn tar     readonly FLOAT_VEC4: 0x8B52;
npm warn tar     readonly INT_VEC2: 0x8B53;
npm warn tar     readonly INT_VEC3: 0x8B54;
npm warn tar     readonly INT_VEC4: 0x8B55;
npm warn tar     readonly BOOL: 0x8B56;
npm warn tar     readonly BOOL_VEC2: 0x8B57;
npm warn tar     readonly BOOL_VEC3: 0x8B58;
npm warn tar     readonly BOOL_VEC4: 0x8B59;
npm warn tar     readonly FLOAT_MAT2: 0x8B5A;
npm warn tar     readonly FLOAT_MAT3: 0x8B5B;
npm warn tar     readonly FLOAT_MAT4: 0x8B5C;
npm warn tar     readonly SAMPLER_2D: 0x8B5E;
npm warn tar     readonly SAMPLER_CUBE: 0x8B60;
npm warn tar     readonly VERTEX_ATTRIB_ARRAY_ENABLED: 0x8622;
npm warn tar     readonly VERTEX_ATTRIB_ARRAY_SIZE: 0x8623;
npm warn tar     readonly VERTEX_ATTRIB_ARRAY_STRIDE: 0x8624;
npm warn tar     readonly VERTEX_ATTRIB_ARRAY_TYPE: 0x8625;
npm warn tar     readonly VERTEX_ATTRIB_ARRAY_NORMALIZED: 0x886A;
npm warn tar     readonly VERTEX_ATTRIB_ARRAY_POINTER: 0x8645;
npm warn tar     readonly VERTEX_ATTRIB_ARRAY_BUFFER_BINDING: 0x889F;
npm warn tar     readonly IMPLEMENTATION_COLOR_READ_TYPE: 0x8B9A;
npm warn tar     readonly IMPLEMENTATION_COLOR_READ_FORMAT: 0x8B9B;
npm warn tar     readonly COMPILE_STATUS: 0x8B81;
npm warn tar     readonly LOW_FLOAT: 0x8DF0;
npm warn tar     readonly MEDIUM_FLOAT: 0x8DF1;
npm warn tar     readonly HIGH_FLOAT: 0x8DF2;
npm warn tar     readonly LOW_INT: 0x8DF3;
npm warn tar     readonly MEDIUM_INT: 0x8DF4;
npm warn tar     readonly HIGH_INT: 0x8DF5;
npm warn tar     readonly FRAMEBUFFER: 0x8D40;
npm warn tar     readonly RENDERBUFFER: 0x8D41;
npm warn tar     readonly RGBA4: 0x8056;
npm warn tar     readonly RGB5_A1: 0x8057;
npm warn tar     readonly RGBA8: 0x8058;
npm warn tar     readonly RGB565: 0x8D62;
npm warn tar     readonly DEPTH_COMPONENT16: 0x81A5;
npm warn tar     readonly STENCIL_INDEX8: 0x8D48;
npm warn tar     readonly DEPTH_STENCIL: 0x84F9;
npm warn tar     readonly RENDERBUFFER_WIDTH: 0x8D42;
npm warn tar     readonly RENDERBUFFER_HEIGHT: 0x8D43;
npm warn tar     readonly RENDERBUFFER_INTERNAL_FORMAT: 0x8D44;
npm warn tar     readonly RENDERBUFFER_RED_SIZE: 0x8D50;
npm warn tar     readonly RENDERBUFFER_GREEN_SIZE: 0x8D51;
npm warn tar     readonly RENDERBUFFER_BLUE_SIZE: 0x8D52;
npm warn tar     readonly RENDERBUFFER_ALPHA_SIZE: 0x8D53;
npm warn tar     readonly RENDERBUFFER_DEPTH_SIZE: 0x8D54;
npm warn tar     readonly RENDERBUFFER_STENCIL_SIZE: 0x8D55;
npm warn tar     readonly FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE: 0x8CD0;
npm warn tar     readonly FRAMEBUFFER_ATTACHMENT_OBJECT_NAME: 0x8CD1;
npm warn tar     readonly FRAMEBUFFER_ATTACHMENT_TEXTURE_LEVEL: 0x8CD2;
npm warn tar     readonly FRAMEBUFFER_ATTACHMENT_TEXTURE_CUBE_MAP_FACE: 0x8CD3;
npm warn tar     readonly COLOR_ATTACHMENT0: 0x8CE0;
npm warn tar     readonly DEPTH_ATTACHMENT: 0x8D00;
npm warn tar     readonly STENCIL_ATTACHMENT: 0x8D20;
npm warn tar     readonly DEPTH_STENCIL_ATTACHMENT: 0x821A;
npm warn tar     readonly NONE: 0;
npm warn tar     readonly FRAMEBUFFER_COMPLETE: 0x8CD5;
npm warn tar     readonly FRAMEBUFFER_INCOMPLETE_ATTACHMENT: 0x8CD6;
npm warn tar     readonly FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT: 0x8CD7;
npm warn tar     readonly FRAMEBUFFER_INCOMPLETE_DIMENSIONS: 0x8CD9;
npm warn tar     readonly FRAMEBUFFER_UNSUPPORTED: 0x8CDD;
npm warn tar     readonly FRAMEBUFFER_BINDING: 0x8CA6;
npm warn tar     readonly RENDERBUFFER_BINDING: 0x8CA7;
npm warn tar     readonly MAX_RENDERBUFFER_SIZE: 0x84E8;
npm warn tar     readonly INVALID_FRAMEBUFFER_OPERATION: 0x0506;
npm warn tar     readonly UNPACK_FLIP_Y_WEBGL: 0x9240;
npm warn tar     readonly UNPACK_PREMULTIPLY_ALPHA_WEBGL: 0x9241;
npm warn tar     readonly CONTEXT_LOST_WEBGL: 0x9242;
npm warn tar     readonly UNPACK_COLORSPACE_CONVERSION_WEBGL: 0x9243;
npm warn tar     readonly BROWSER_DEFAULT_WEBGL: 0x9244;
npm warn tar };
npm warn tar
npm warn tar interface WebGLRenderingContextBase {
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/canvas) */
npm warn tar     readonly canvas: HTMLCanvasElement | OffscreenCanvas;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGL2RenderingContext/drawingBufferColorSpace) */
npm warn tar     drawingBufferColorSpace: PredefinedColorSpace;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/drawingBufferHeight) */
npm warn tar     readonly drawingBufferHeight: GLsizei;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/drawingBufferWidth) */
npm warn tar     readonly drawingBufferWidth: GLsizei;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGL2RenderingContext/unpackColorSpace) */
npm warn tar     unpackColorSpace: PredefinedColorSpace;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/activeTexture) */
npm warn tar     activeTexture(texture: GLenum): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/attachShader) */
npm warn tar     attachShader(program: WebGLProgram, shader: WebGLShader): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/bindAttribLocation) */
npm warn tar     bindAttribLocation(program: WebGLProgram, index: GLuint, name: string): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/bindBuffer) */
npm warn tar     bindBuffer(target: GLenum, buffer: WebGLBuffer | null): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/bindFramebuffer) */
npm warn tar     bindFramebuffer(target: GLenum, framebuffer: WebGLFramebuffer | null): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/bindRenderbuffer) */
npm warn tar     bindRenderbuffer(target: GLenum, renderbuffer: WebGLRenderbuffer | null): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/bindTexture) */
npm warn tar     bindTexture(target: GLenum, texture: WebGLTexture | null): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/blendColor) */
npm warn tar     blendColor(red: GLclampf, green: GLclampf, blue: GLclampf, alpha: GLclampf): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/blendEquation) */
npm warn tar     blendEquation(mode: GLenum): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/blendEquationSeparate) */
npm warn tar     blendEquationSeparate(modeRGB: GLenum, modeAlpha: GLenum): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/blendFunc) */
npm warn tar     blendFunc(sfactor: GLenum, dfactor: GLenum): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/blendFuncSeparate) */
npm warn tar     blendFuncSeparate(srcRGB: GLenum, dstRGB: GLenum, srcAlpha: GLenum, dstAlpha: GLenum): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/checkFramebufferStatus) */
npm warn tar     checkFramebufferStatus(target: GLenum): GLenum;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/clear) */
npm warn tar     clear(mask: GLbitfield): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/clearColor) */
npm warn tar     clearColor(red: GLclampf, green: GLclampf, blue: GLclampf, alpha: GLclampf): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/clearDepth) */
npm warn tar     clearDepth(depth: GLclampf): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/clearStencil) */
npm warn tar     clearStencil(s: GLint): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/colorMask) */
npm warn tar     colorMask(red: GLboolean, green: GLboolean, blue: GLboolean, alpha: GLboolean): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/compileShader) */
npm warn tar     compileShader(shader: WebGLShader): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/copyTexImage2D) */
npm warn tar     copyTexImage2D(target: GLenum, level: GLint, internalformat: GLenum, x: GLint, y: GLint, width: GLsizei, height: GLsizei, border: GLint): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/copyTexSubImage2D) */
npm warn tar     copyTexSubImage2D(target: GLenum, level: GLint, xoffset: GLint, yoffset: GLint, x: GLint, y: GLint, width: GLsizei, height: GLsizei): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/createBuffer) */
npm warn tar     createBuffer(): WebGLBuffer;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/createFramebuffer) */
npm warn tar     createFramebuffer(): WebGLFramebuffer;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/createProgram) */
npm warn tar     createProgram(): WebGLProgram;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/createRenderbuffer) */
npm warn tar     createRenderbuffer(): WebGLRenderbuffer;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/createShader) */
npm warn tar     createShader(type: GLenum): WebGLShader | null;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/createTexture) */
npm warn tar     createTexture(): WebGLTexture;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/cullFace) */
npm warn tar     cullFace(mode: GLenum): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/deleteBuffer) */
npm warn tar     deleteBuffer(buffer: WebGLBuffer | null): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/deleteFramebuffer) */
npm warn tar     deleteFramebuffer(framebuffer: WebGLFramebuffer | null): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/deleteProgram) */
npm warn tar     deleteProgram(program: WebGLProgram | null): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/deleteRenderbuffer) */
npm warn tar     deleteRenderbuffer(renderbuffer: WebGLRenderbuffer | null): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/deleteShader) */
npm warn tar     deleteShader(shader: WebGLShader | null): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/deleteTexture) */
npm warn tar     deleteTexture(texture: WebGLTexture | null): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/depthFunc) */
npm warn tar     depthFunc(func: GLenum): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/depthMask) */
npm warn tar     depthMask(flag: GLboolean): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/depthRange) */
npm warn tar     depthRange(zNear: GLclampf, zFar: GLclampf): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/detachShader) */
npm warn tar     detachShader(program: WebGLProgram, shader: WebGLShader): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/disable) */
npm warn tar     disable(cap: GLenum): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/disableVertexAttribArray) */
npm warn tar     disableVertexAttribArray(index: GLuint): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/drawArrays) */
npm warn tar     drawArrays(mode: GLenum, first: GLint, count: GLsizei): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/drawElements) */
npm warn tar     drawElements(mode: GLenum, count: GLsizei, type: GLenum, offset: GLintptr): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/enable) */
npm warn tar     enable(cap: GLenum): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/enableVertexAttribArray) */
npm warn tar     enableVertexAttribArray(index: GLuint): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/finish) */
npm warn tar     finish(): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/flush) */
npm warn tar     flush(): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/framebufferRenderbuffer) */
npm warn tar     framebufferRenderbuffer(target: GLenum, attachment: GLenum, renderbuffertarget: GLenum, renderbuffer: WebGLRenderbuffer | null): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/framebufferTexture2D) */
npm warn tar     framebufferTexture2D(target: GLenum, attachment: GLenum, textarget: GLenum, texture: WebGLTexture | null, level: GLint): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/frontFace) */
npm warn tar     frontFace(mode: GLenum): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/generateMipmap) */
npm warn tar     generateMipmap(target: GLenum): void;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/getActiveAttrib) */
npm warn tar     getActiveAttrib(program: WebGLProgram, index: GLuint): WebGLActiveInfo | null;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/getActiveUniform) */
npm warn tar     getActiveUniform(program: WebGLProgram, index: GLuint): WebGLActiveInfo | null;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/getAttachedShaders) */
npm warn tar     getAttachedShaders(program: WebGLProgram): WebGLShader[] | null;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/getAttribLocation) */
npm warn tar     getAttribLocation(program: WebGLProgram, name: string): GLint;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/getBufferParameter) */
npm warn tar     getBufferParameter(target: GLenum, pname: GLenum): any;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/getContextAttributes) */
npm warn tar     getContextAttributes(): WebGLContextAttributes | null;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/getError) */
npm warn tar     getError(): GLenum;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/getExtension) */
npm warn tar     getExtension(name: string): any;
npm warn tar     getExtension(extensionName: "ANGLE_instanced_arrays"): ANGLE_instanced_arrays | null;
npm warn tar     getExtension(extensionName: "EXT_blend_minmax"): EXT_blend_minmax | null;
npm warn tar     getExtension(extensionName: "EXT_color_buffer_float"): EXT_color_buffer_float | null;
npm warn tar     getExtension(extensionName: "EXT_color_buffer_half_float"): EXT_color_buffer_half_float | null;
npm warn tar     getExtension(extensionName: "EXT_float_blend"): EXT_float_blend | null;
npm warn tar     getExtension(extensionName: "EXT_frag_depth"): EXT_frag_depth | null;
npm warn tar     getExtension(extensionName: "EXT_sRGB"): EXT_sRGB | null;
npm warn tar     getExtension(extensionName: "EXT_shader_texture_lod"): EXT_shader_texture_lod | null;
npm warn tar     getExtension(extensionName: "EXT_texture_compression_bptc"): EXT_texture_compression_bptc | null;
npm warn tar     getExtension(extensionName: "EXT_texture_compression_rgtc"): EXT_texture_compression_rgtc | null;
npm warn tar     getExtension(extensionName: "EXT_texture_filter_anisotropic"): EXT_texture_filter_anisotropic | null;
npm warn tar     getExtension(extensionName: "KHR_parallel_shader_compile"): KHR_parallel_shader_compile | null;
npm warn tar     getExtension(extensionName: "OES_element_index_uint"): OES_element_index_uint | null;
npm warn tar     getExtension(extensionName: "OES_fbo_render_mipmap"): OES_fbo_render_mipmap | null;
npm warn tar     getExtension(extensionName: "OES_standard_derivatives"): OES_standard_derivatives | null;
npm warn tar     getExtension(extensionName: "OES_texture_float"): OES_texture_float | null;
npm warn tar     getExtension(extensionName: "OES_texture_float_linear"): OES_texture_float_linear | null;
npm warn tar     getExtension(extensionName: "OES_texture_half_float"): OES_texture_half_float | null;
npm warn tar     getExtension(extensionName: "OES_texture_half_float_linear"): OES_texture_half_float_linear | null;
npm warn tar     getExtension(extensionName: "OES_vertex_array_object"): OES_vertex_array_object | null;
npm warn tar     getExtension(extensionName: "OVR_multiview2"): OVR_multiview2 | null;
npm warn tar     getExtension(extensionName: "WEBGL_color_buffer_float"): WEBGL_color_buffer_float | null;
npm warn tar     getExtension(extensionName: "WEBGL_compressed_texture_astc"): WEBGL_compressed_texture_astc | null;
npm warn tar     getExtension(extensionName: "WEBGL_compressed_texture_etc"): WEBGL_compressed_texture_etc | null;
npm warn tar     getExtension(extensionName: "WEBGL_compressed_texture_etc1"): WEBGL_compressed_texture_etc1 | null;
npm warn tar     getExtension(extensionName: "WEBGL_compressed_texture_pvrtc"): WEBGL_compressed_texture_pvrtc | null;
npm warn tar     getExtension(extensionName: "WEBGL_compressed_texture_s3tc"): WEBGL_compressed_texture_s3tc | null;
npm warn tar     getExtension(extensionName: "WEBGL_compressed_texture_s3tc_srgb"): WEBGL_compressed_texture_s3tc_srgb | null;
npm warn tar     getExtension(extensionName: "WEBGL_debug_renderer_info"): WEBGL_debug_renderer_info | null;
npm warn tar     getExtension(extensionName: "WEBGL_debug_shaders"): WEBGL_debug_shaders | null;
npm warn tar     getExtension(extensionName: "WEBGL_depth_texture"): WEBGL_depth_texture | null;
npm warn tar     getExtension(extensionName: "WEBGL_draw_buffers"): WEBGL_draw_buffers | null;
npm warn tar     getExtension(extensionName: "WEBGL_lose_context"): WEBGL_lose_context | null;
npm warn tar     getExtension(extensionName: "WEBGL_multi_draw"): WEBGL_multi_draw | null;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/getFramebufferAttachmentParameter) */
npm warn tar     getFramebufferAttachmentParameter(target: GLenum, attachment: GLenum, pname: GLenum): any;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/getParameter) */
npm warn tar     getParameter(pname: GLenum): any;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/getProgramInfoLog) */
npm warn tar     getProgramInfoLog(program: WebGLProgram): string | null;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/getProgramParameter) */
npm warn tar     getProgramParameter(program: WebGLProgram, pname: GLenum): any;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/getRenderbufferParameter) */
npm warn tar     getRenderbufferParameter(target: GLenum, pname: GLenum): any;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/getShaderInfoLog) */
npm warn tar     getShaderInfoLog(shader: WebGLShader): string | null;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/getShaderParameter) */
npm warn tar     getShaderParameter(shader: WebGLShader, pname: GLenum): any;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/getShaderPrecisionFormat) */
npm warn tar     getShaderPrecisionFormat(shadertype: GLenum, precisiontype: GLenum): WebGLShaderPrecisionFormat | null;
npm warn tar     /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/getShaderSourcD^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@

[ng new] 
> npx
> create my-ng-app --skip-install --skip-git --defaults


[ng new] Error: child_process.spawnSync is not implemented yet (needs a synchronous kernel bridge)
    at http://localhost:5184/@fs/home/ddn9hc/workspace/duck/webcontainer/packages/core/dist/workers/process/worker.js:7346:11
    at eval (dwc://module/home/user/.npm/_npx/5b5a2fdb7ee15b24/node_modules/@angular/create/src/index.js:25:54)
    at loadModule (http://localhost:5184/@fs/home/ddn9hc/workspace/duck/webcontainer/packages/core/dist/workers/process/worker.js:22680:7)
    at Object.run (http://localhost:5184/@fs/home/ddn9hc/workspace/duck/webcontainer/packages/core/dist/workers/process/worker.js:22702:14)
    at boot (http://localhost:5184/@fs/home/ddn9hc/workspace/duck/webcontainer/packages/core/dist/workers/process/worker.js:23317:24)
    at self.onmessage (http://localhost:5184/@fs/home/ddn9hc/workspace/duck/webcontainer/packages/core/dist/workers/process/worker.js:23341:35)

[ng new] npm error code 1

[ng new] npm error path /

[ng new] npm error command failed

[ng new] npm error command sh -c create my-ng-app --skip-install --skip-git --defaults

[ng new] 
[ng new] 
[ng new] exit=1
"

```

```yaml
- text: "warn tar readonly ELEMENT_ARRAY_BUFFER: 0x8893; npm warn tar readonly ARRAY_BUFFER_BINDING: 0x8894; npm warn tar readonly ELEMENT_ARRAY_BUFFER_BINDING: 0x8895; npm warn tar readonly STREAM_DRAW: 0x88E0; npm warn tar readonly STATIC_DRAW: 0x88E4; npm warn tar readonly DYNAMIC_DRAW: 0x88E8; npm warn tar readonly BUFFER_SIZE: 0x8764; npm warn tar readonly BUFFER_USAGE: 0x8765; npm warn tar readonly CURRENT_VERTEX_ATTRIB: 0x8626; npm warn tar readonly FRONT: 0x0404; npm warn tar readonly BACK: 0x0405; npm warn tar readonly FRONT_AND_BACK: 0x0408; npm warn tar readonly CULL_FACE: 0x0B44; npm warn tar readonly BLEND: 0x0BE2; npm warn tar readonly DITHER: 0x0BD0; npm warn tar readonly STENCIL_TEST: 0x0B90; npm warn tar readonly DEPTH_TEST: 0x0B71; npm warn tar readonly SCISSOR_TEST: 0x0C11; npm warn tar readonly POLYGON_OFFSET_FILL: 0x8037; npm warn tar readonly SAMPLE_ALPHA_TO_COVERAGE: 0x809E; npm warn tar readonly SAMPLE_COVERAGE: 0x80A0; npm warn tar readonly NO_ERROR: 0; npm warn tar readonly INVALID_ENUM: 0x0500; npm warn tar readonly INVALID_VALUE: 0x0501; npm warn tar readonly INVALID_OPERATION: 0x0502; npm warn tar readonly OUT_OF_MEMORY: 0x0505; npm warn tar readonly CW: 0x0900; npm warn tar readonly CCW: 0x0901; npm warn tar readonly LINE_WIDTH: 0x0B21; npm warn tar readonly ALIASED_POINT_SIZE_RANGE: 0x846D; npm warn tar readonly ALIASED_LINE_WIDTH_RANGE: 0x846E; npm warn tar readonly CULL_FACE_MODE: 0x0B45; npm warn tar readonly FRONT_FACE: 0x0B46; npm warn tar readonly DEPTH_RANGE: 0x0B70; npm warn tar readonly DEPTH_WRITEMASK: 0x0B72; npm warn tar readonly DEPTH_CLEAR_VALUE: 0x0B73; npm warn tar readonly DEPTH_FUNC: 0x0B74; npm warn tar readonly STENCIL_CLEAR_VALUE: 0x0B91; npm warn tar readonly STENCIL_FUNC: 0x0B92; npm warn tar readonly STENCIL_FAIL: 0x0B94; npm warn tar readonly STENCIL_PASS_DEPTH_FAIL: 0x0B95; npm warn tar readonly STENCIL_PASS_DEPTH_PASS: 0x0B96; npm warn tar readonly STENCIL_REF: 0x0B97; npm warn tar readonly STENCIL_VALUE_MASK: 0x0B93; npm warn tar readonly STENCIL_WRITEMASK: 0x0B98; npm warn tar readonly STENCIL_BACK_FUNC: 0x8800; npm warn tar readonly STENCIL_BACK_FAIL: 0x8801; npm warn tar readonly STENCIL_BACK_PASS_DEPTH_FAIL: 0x8802; npm warn tar readonly STENCIL_BACK_PASS_DEPTH_PASS: 0x8803; npm warn tar readonly STENCIL_BACK_REF: 0x8CA3; npm warn tar readonly STENCIL_BACK_VALUE_MASK: 0x8CA4; npm warn tar readonly STENCIL_BACK_WRITEMASK: 0x8CA5; npm warn tar readonly VIEWPORT: 0x0BA2; npm warn tar readonly SCISSOR_BOX: 0x0C10; npm warn tar readonly COLOR_CLEAR_VALUE: 0x0C22; npm warn tar readonly COLOR_WRITEMASK: 0x0C23; npm warn tar readonly UNPACK_ALIGNMENT: 0x0CF5; npm warn tar readonly PACK_ALIGNMENT: 0x0D05; npm warn tar readonly MAX_TEXTURE_SIZE: 0x0D33; npm warn tar readonly MAX_VIEWPORT_DIMS: 0x0D3A; npm warn tar readonly SUBPIXEL_BITS: 0x0D50; npm warn tar readonly RED_BITS: 0x0D52; npm warn tar readonly GREEN_BITS: 0x0D53; npm warn tar readonly BLUE_BITS: 0x0D54; npm warn tar readonly ALPHA_BITS: 0x0D55; npm warn tar readonly DEPTH_BITS: 0x0D56; npm warn tar readonly STENCIL_BITS: 0x0D57; npm warn tar readonly POLYGON_OFFSET_UNITS: 0x2A00; npm warn tar readonly POLYGON_OFFSET_FACTOR: 0x8038; npm warn tar readonly TEXTURE_BINDING_2D: 0x8069; npm warn tar readonly SAMPLE_BUFFERS: 0x80A8; npm warn tar readonly SAMPLES: 0x80A9; npm warn tar readonly SAMPLE_COVERAGE_VALUE: 0x80AA; npm warn tar readonly SAMPLE_COVERAGE_INVERT: 0x80AB; npm warn tar readonly COMPRESSED_TEXTURE_FORMATS: 0x86A3; npm warn tar readonly DONT_CARE: 0x1100; npm warn tar readonly FASTEST: 0x1101; npm warn tar readonly NICEST: 0x1102; npm warn tar readonly GENERATE_MIPMAP_HINT: 0x8192; npm warn tar readonly BYTE: 0x1400; npm warn tar readonly UNSIGNED_BYTE: 0x1401; npm warn tar readonly SHORT: 0x1402; npm warn tar readonly UNSIGNED_SHORT: 0x1403; npm warn tar readonly INT: 0x1404; npm warn tar readonly UNSIGNED_INT: 0x1405; npm warn tar readonly FLOAT: 0x1406; npm warn tar readonly DEPTH_COMPONENT: 0x1902; npm warn tar readonly ALPHA: 0x1906; npm warn tar readonly RGB: 0x1907; npm warn tar readonly RGBA: 0x1908; npm warn tar readonly LUMINANCE: 0x1909; npm warn tar readonly LUMINANCE_ALPHA: 0x190A; npm warn tar readonly UNSIGNED_SHORT_4_4_4_4: 0x8033; npm warn tar readonly UNSIGNED_SHORT_5_5_5_1: 0x8034; npm warn tar readonly UNSIGNED_SHORT_5_6_5: 0x8363; npm warn tar readonly FRAGMENT_SHADER: 0x8B30; npm warn tar readonly VERTEX_SHADER: 0x8B31; npm warn tar readonly MAX_VERTEX_ATTRIBS: 0x8869; npm warn tar readonly MAX_VERTEX_UNIFORM_VECTORS: 0x8DFB; npm warn tar readonly MAX_VARYING_VECTORS: 0x8DFC; npm warn tar readonly MAX_COMBINED_TEXTURE_IMAGE_UNITS: 0x8B4D; npm warn tar readonly MAX_VERTEX_TEXTURE_IMAGE_UNITS: 0x8B4C; npm warn tar readonly MAX_TEXTURE_IMAGE_UNITS: 0x8872; npm warn tar readonly MAX_FRAGMENT_UNIFORM_VECTORS: 0x8DFD; npm warn tar readonly SHADER_TYPE: 0x8B4F; npm warn tar readonly DELETE_STATUS: 0x8B80; npm warn tar readonly LINK_STATUS: 0x8B82; npm warn tar readonly VALIDATE_STATUS: 0x8B83; npm warn tar readonly ATTACHED_SHADERS: 0x8B85; npm warn tar readonly ACTIVE_UNIFORMS: 0x8B86; npm warn tar readonly ACTIVE_ATTRIBUTES: 0x8B89; npm warn tar readonly SHADING_LANGUAGE_VERSION: 0x8B8C; npm warn tar readonly CURRENT_PROGRAM: 0x8B8D; npm warn tar readonly NEVER: 0x0200; npm warn tar readonly LESS: 0x0201; npm warn tar readonly EQUAL: 0x0202; npm warn tar readonly LEQUAL: 0x0203; npm warn tar readonly GREATER: 0x0204; npm warn tar readonly NOTEQUAL: 0x0205; npm warn tar readonly GEQUAL: 0x0206; npm warn tar readonly ALWAYS: 0x0207; npm warn tar readonly KEEP: 0x1E00; npm warn tar readonly REPLACE: 0x1E01; npm warn tar readonly INCR: 0x1E02; npm warn tar readonly DECR: 0x1E03; npm warn tar readonly INVERT: 0x150A; npm warn tar readonly INCR_WRAP: 0x8507; npm warn tar readonly DECR_WRAP: 0x8508; npm warn tar readonly VENDOR: 0x1F00; npm warn tar readonly RENDERER: 0x1F01; npm warn tar readonly VERSION: 0x1F02; npm warn tar readonly NEAREST: 0x2600; npm warn tar readonly LINEAR: 0x2601; npm warn tar readonly NEAREST_MIPMAP_NEAREST: 0x2700; npm warn tar readonly LINEAR_MIPMAP_NEAREST: 0x2701; npm warn tar readonly NEAREST_MIPMAP_LINEAR: 0x2702; npm warn tar readonly LINEAR_MIPMAP_LINEAR: 0x2703; npm warn tar readonly TEXTURE_MAG_FILTER: 0x2800; npm warn tar readonly TEXTURE_MIN_FILTER: 0x2801; npm warn tar readonly TEXTURE_WRAP_S: 0x2802; npm warn tar readonly TEXTURE_WRAP_T: 0x2803; npm warn tar readonly TEXTURE_2D: 0x0DE1; npm warn tar readonly TEXTURE: 0x1702; npm warn tar readonly TEXTURE_CUBE_MAP: 0x8513; npm warn tar readonly TEXTURE_BINDING_CUBE_MAP: 0x8514; npm warn tar readonly TEXTURE_CUBE_MAP_POSITIVE_X: 0x8515; npm warn tar readonly TEXTURE_CUBE_MAP_NEGATIVE_X: 0x8516; npm warn tar readonly TEXTURE_CUBE_MAP_POSITIVE_Y: 0x8517; npm warn tar readonly TEXTURE_CUBE_MAP_NEGATIVE_Y: 0x8518; npm warn tar readonly TEXTURE_CUBE_MAP_POSITIVE_Z: 0x8519; npm warn tar readonly TEXTURE_CUBE_MAP_NEGATIVE_Z: 0x851A; npm warn tar readonly MAX_CUBE_MAP_TEXTURE_SIZE: 0x851C; npm warn tar readonly TEXTURE0: 0x84C0; npm warn tar readonly TEXTURE1: 0x84C1; npm warn tar readonly TEXTURE2: 0x84C2; npm warn tar readonly TEXTURE3: 0x84C3; npm warn tar readonly TEXTURE4: 0x84C4; npm warn tar readonly TEXTURE5: 0x84C5; npm warn tar readonly TEXTURE6: 0x84C6; npm warn tar readonly TEXTURE7: 0x84C7; npm warn tar readonly TEXTURE8: 0x84C8; npm warn tar readonly TEXTURE9: 0x84C9; npm warn tar readonly TEXTURE10: 0x84CA; npm warn tar readonly TEXTURE11: 0x84CB; npm warn tar readonly TEXTURE12: 0x84CC; npm warn tar readonly TEXTURE13: 0x84CD; npm warn tar readonly TEXTURE14: 0x84CE; npm warn tar readonly TEXTURE15: 0x84CF; npm warn tar readonly TEXTURE16: 0x84D0; npm warn tar readonly TEXTURE17: 0x84D1; npm warn tar readonly TEXTURE18: 0x84D2; npm warn tar readonly TEXTURE19: 0x84D3; npm warn tar readonly TEXTURE20: 0x84D4; npm warn tar readonly TEXTURE21: 0x84D5; npm warn tar readonly TEXTURE22: 0x84D6; npm warn tar readonly TEXTURE23: 0x84D7; npm warn tar readonly TEXTURE24: 0x84D8; npm warn tar readonly TEXTURE25: 0x84D9; npm warn tar readonly TEXTURE26: 0x84DA; npm warn tar readonly TEXTURE27: 0x84DB; npm warn tar readonly TEXTURE28: 0x84DC; npm warn tar readonly TEXTURE29: 0x84DD; npm warn tar readonly TEXTURE30: 0x84DE; npm warn tar readonly TEXTURE31: 0x84DF; npm warn tar readonly ACTIVE_TEXTURE: 0x84E0; npm warn tar readonly REPEAT: 0x2901; npm warn tar readonly CLAMP_TO_EDGE: 0x812F; npm warn tar readonly MIRRORED_REPEAT: 0x8370; npm warn tar readonly FLOAT_VEC2: 0x8B50; npm warn tar readonly FLOAT_VEC3: 0x8B51; npm warn tar readonly FLOAT_VEC4: 0x8B52; npm warn tar readonly INT_VEC2: 0x8B53; npm warn tar readonly INT_VEC3: 0x8B54; npm warn tar readonly INT_VEC4: 0x8B55; npm warn tar readonly BOOL: 0x8B56; npm warn tar readonly BOOL_VEC2: 0x8B57; npm warn tar readonly BOOL_VEC3: 0x8B58; npm warn tar readonly BOOL_VEC4: 0x8B59; npm warn tar readonly FLOAT_MAT2: 0x8B5A; npm warn tar readonly FLOAT_MAT3: 0x8B5B; npm warn tar readonly FLOAT_MAT4: 0x8B5C; npm warn tar readonly SAMPLER_2D: 0x8B5E; npm warn tar readonly SAMPLER_CUBE: 0x8B60; npm warn tar readonly VERTEX_ATTRIB_ARRAY_ENABLED: 0x8622; npm warn tar readonly VERTEX_ATTRIB_ARRAY_SIZE: 0x8623; npm warn tar readonly VERTEX_ATTRIB_ARRAY_STRIDE: 0x8624; npm warn tar readonly VERTEX_ATTRIB_ARRAY_TYPE: 0x8625; npm warn tar readonly VERTEX_ATTRIB_ARRAY_NORMALIZED: 0x886A; npm warn tar readonly VERTEX_ATTRIB_ARRAY_POINTER: 0x8645; npm warn tar readonly VERTEX_ATTRIB_ARRAY_BUFFER_BINDING: 0x889F; npm warn tar readonly IMPLEMENTATION_COLOR_READ_TYPE: 0x8B9A; npm warn tar readonly IMPLEMENTATION_COLOR_READ_FORMAT: 0x8B9B; npm warn tar readonly COMPILE_STATUS: 0x8B81; npm warn tar readonly LOW_FLOAT: 0x8DF0; npm warn tar readonly MEDIUM_FLOAT: 0x8DF1; npm warn tar readonly HIGH_FLOAT: 0x8DF2; npm warn tar readonly LOW_INT: 0x8DF3; npm warn tar readonly MEDIUM_INT: 0x8DF4; npm warn tar readonly HIGH_INT: 0x8DF5; npm warn tar readonly FRAMEBUFFER: 0x8D40; npm warn tar readonly RENDERBUFFER: 0x8D41; npm warn tar readonly RGBA4: 0x8056; npm warn tar readonly RGB5_A1: 0x8057; npm warn tar readonly RGBA8: 0x8058; npm warn tar readonly RGB565: 0x8D62; npm warn tar readonly DEPTH_COMPONENT16: 0x81A5; npm warn tar readonly STENCIL_INDEX8: 0x8D48; npm warn tar readonly DEPTH_STENCIL: 0x84F9; npm warn tar readonly RENDERBUFFER_WIDTH: 0x8D42; npm warn tar readonly RENDERBUFFER_HEIGHT: 0x8D43; npm warn tar readonly RENDERBUFFER_INTERNAL_FORMAT: 0x8D44; npm warn tar readonly RENDERBUFFER_RED_SIZE: 0x8D50; npm warn tar readonly RENDERBUFFER_GREEN_SIZE: 0x8D51; npm warn tar readonly RENDERBUFFER_BLUE_SIZE: 0x8D52; npm warn tar readonly RENDERBUFFER_ALPHA_SIZE: 0x8D53; npm warn tar readonly RENDERBUFFER_DEPTH_SIZE: 0x8D54; npm warn tar readonly RENDERBUFFER_STENCIL_SIZE: 0x8D55; npm warn tar readonly FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE: 0x8CD0; npm warn tar readonly FRAMEBUFFER_ATTACHMENT_OBJECT_NAME: 0x8CD1; npm warn tar readonly FRAMEBUFFER_ATTACHMENT_TEXTURE_LEVEL: 0x8CD2; npm warn tar readonly FRAMEBUFFER_ATTACHMENT_TEXTURE_CUBE_MAP_FACE: 0x8CD3; npm warn tar readonly COLOR_ATTACHMENT0: 0x8CE0; npm warn tar readonly DEPTH_ATTACHMENT: 0x8D00; npm warn tar readonly STENCIL_ATTACHMENT: 0x8D20; npm warn tar readonly DEPTH_STENCIL_ATTACHMENT: 0x821A; npm warn tar readonly NONE: 0; npm warn tar readonly FRAMEBUFFER_COMPLETE: 0x8CD5; npm warn tar readonly FRAMEBUFFER_INCOMPLETE_ATTACHMENT: 0x8CD6; npm warn tar readonly FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT: 0x8CD7; npm warn tar readonly FRAMEBUFFER_INCOMPLETE_DIMENSIONS: 0x8CD9; npm warn tar readonly FRAMEBUFFER_UNSUPPORTED: 0x8CDD; npm warn tar readonly FRAMEBUFFER_BINDING: 0x8CA6; npm warn tar readonly RENDERBUFFER_BINDING: 0x8CA7; npm warn tar readonly MAX_RENDERBUFFER_SIZE: 0x84E8; npm warn tar readonly INVALID_FRAMEBUFFER_OPERATION: 0x0506; npm warn tar readonly UNPACK_FLIP_Y_WEBGL: 0x9240; npm warn tar readonly UNPACK_PREMULTIPLY_ALPHA_WEBGL: 0x9241; npm warn tar readonly CONTEXT_LOST_WEBGL: 0x9242; npm warn tar readonly UNPACK_COLORSPACE_CONVERSION_WEBGL: 0x9243; npm warn tar readonly BROWSER_DEFAULT_WEBGL: 0x9244; npm warn tar }; npm warn tar npm warn tar interface WebGLRenderingContextBase { npm warn tar /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/canvas) */ npm warn tar readonly canvas: HTMLCanvasElement | OffscreenCanvas; npm warn tar /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGL2RenderingContext/drawingBufferColorSpace) */ npm warn tar drawingBufferColorSpace: PredefinedColorSpace; npm warn tar /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/drawingBufferHeight) */ npm warn tar readonly drawingBufferHeight: GLsizei; npm warn tar /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/drawingBufferWidth) */ npm warn tar readonly drawingBufferWidth: GLsizei; npm warn tar /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGL2RenderingContext/unpackColorSpace) */ npm warn tar unpackColorSpace: PredefinedColorSpace; npm warn tar /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/activeTexture) */ npm warn tar activeTexture(texture: GLenum): void; npm warn tar /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/attachShader) */ npm warn tar attachShader(program: WebGLProgram, shader: WebGLShader): void; npm warn tar /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/bindAttribLocation) */ npm warn tar bindAttribLocation(program: WebGLProgram, index: GLuint, name: string): void; npm warn tar /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/bindBuffer) */ npm warn tar bindBuffer(target: GLenum, buffer: WebGLBuffer | null): void; npm warn tar /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/bindFramebuffer) */ npm warn tar bindFramebuffer(target: GLenum, framebuffer: WebGLFramebuffer | null): void; npm warn tar /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/bindRenderbuffer) */ npm warn tar bindRenderbuffer(target: GLenum, renderbuffer: WebGLRenderbuffer | null): void; npm warn tar /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/bindTexture) */ npm warn tar bindTexture(target: GLenum, texture: WebGLTexture | null): void; npm warn tar /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/blendColor) */ npm warn tar blendColor(red: GLclampf, green: GLclampf, blue: GLclampf, alpha: GLclampf): void; npm warn tar /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/blendEquation) */ npm warn tar blendEquation(mode: GLenum): void; npm warn tar /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/blendEquationSeparate) */ npm warn tar blendEquationSeparate(modeRGB: GLenum, modeAlpha: GLenum): void; npm warn tar /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/blendFunc) */ npm warn tar blendFunc(sfactor: GLenum, dfactor: GLenum): void; npm warn tar /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/blendFuncSeparate) */ npm warn tar blendFuncSeparate(srcRGB: GLenum, dstRGB: GLenum, srcAlpha: GLenum, dstAlpha: GLenum): void; npm warn tar /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/checkFramebufferStatus) */ npm warn tar checkFramebufferStatus(target: GLenum): GLenum; npm warn tar /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/clear) */ npm warn tar clear(mask: GLbitfield): void; npm warn tar /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/clearColor) */ npm warn tar clearColor(red: GLclampf, green: GLclampf, blue: GLclampf, alpha: GLclampf): void; npm warn tar /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/clearDepth) */ npm warn tar clearDepth(depth: GLclampf): void; npm warn tar /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/clearStencil) */ npm warn tar clearStencil(s: GLint): void; npm warn tar /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/colorMask) */ npm warn tar colorMask(red: GLboolean, green: GLboolean, blue: GLboolean, alpha: GLboolean): void; npm warn tar /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/compileShader) */ npm warn tar compileShader(shader: WebGLShader): void; npm warn tar /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/copyTexImage2D) */ npm warn tar copyTexImage2D(target: GLenum, level: GLint, internalformat: GLenum, x: GLint, y: GLint, width: GLsizei, height: GLsizei, border: GLint): void; npm warn tar /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/copyTexSubImage2D) */ npm warn tar copyTexSubImage2D(target: GLenum, level: GLint, xoffset: GLint, yoffset: GLint, x: GLint, y: GLint, width: GLsizei, height: GLsizei): void; npm warn tar /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/createBuffer) */ npm warn tar createBuffer(): WebGLBuffer; npm warn tar /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/createFramebuffer) */ npm warn tar createFramebuffer(): WebGLFramebuffer; npm warn tar /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/createProgram) */ npm warn tar createProgram(): WebGLProgram; npm warn tar /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/createRenderbuffer) */ npm warn tar createRenderbuffer(): WebGLRenderbuffer; npm warn tar /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/createShader) */ npm warn tar createShader(type: GLenum): WebGLShader | null; npm warn tar /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/createTexture) */ npm warn tar createTexture(): WebGLTexture; npm warn tar /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/cullFace) */ npm warn tar cullFace(mode: GLenum): void; npm warn tar /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/deleteBuffer) */ npm warn tar deleteBuffer(buffer: WebGLBuffer | null): void; npm warn tar /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/deleteFramebuffer) */ npm warn tar deleteFramebuffer(framebuffer: WebGLFramebuffer | null): void; npm warn tar /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/deleteProgram) */ npm warn tar deleteProgram(program: WebGLProgram | null): void; npm warn tar /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/deleteRenderbuffer) */ npm warn tar deleteRenderbuffer(renderbuffer: WebGLRenderbuffer | null): void; npm warn tar /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/deleteShader) */ npm warn tar deleteShader(shader: WebGLShader | null): void; npm warn tar /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/deleteTexture) */ npm warn tar deleteTexture(texture: WebGLTexture | null): void; npm warn tar /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/depthFunc) */ npm warn tar depthFunc(func: GLenum): void; npm warn tar /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/depthMask) */ npm warn tar depthMask(flag: GLboolean): void; npm warn tar /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/depthRange) */ npm warn tar depthRange(zNear: GLclampf, zFar: GLclampf): void; npm warn tar /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/detachShader) */ npm warn tar detachShader(program: WebGLProgram, shader: WebGLShader): void; npm warn tar /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/disable) */ npm warn tar disable(cap: GLenum): void; npm warn tar /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/disableVertexAttribArray) */ npm warn tar disableVertexAttribArray(index: GLuint): void; npm warn tar /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/drawArrays) */ npm warn tar drawArrays(mode: GLenum, first: GLint, count: GLsizei): void; npm warn tar /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/drawElements) */ npm warn tar drawElements(mode: GLenum, count: GLsizei, type: GLenum, offset: GLintptr): void; npm warn tar /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/enable) */ npm warn tar enable(cap: GLenum): void; npm warn tar /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/enableVertexAttribArray) */ npm warn tar enableVertexAttribArray(index: GLuint): void; npm warn tar /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/finish) */ npm warn tar finish(): void; npm warn tar /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/flush) */ npm warn tar flush(): void; npm warn tar /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/framebufferRenderbuffer) */ npm warn tar framebufferRenderbuffer(target: GLenum, attachment: GLenum, renderbuffertarget: GLenum, renderbuffer: WebGLRenderbuffer | null): void; npm warn tar /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/framebufferTexture2D) */ npm warn tar framebufferTexture2D(target: GLenum, attachment: GLenum, textarget: GLenum, texture: WebGLTexture | null, level: GLint): void; npm warn tar /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/frontFace) */ npm warn tar frontFace(mode: GLenum): void; npm warn tar /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/generateMipmap) */ npm warn tar generateMipmap(target: GLenum): void; npm warn tar /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/getActiveAttrib) */ npm warn tar getActiveAttrib(program: WebGLProgram, index: GLuint): WebGLActiveInfo | null; npm warn tar /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/getActiveUniform) */ npm warn tar getActiveUniform(program: WebGLProgram, index: GLuint): WebGLActiveInfo | null; npm warn tar /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/getAttachedShaders) */ npm warn tar getAttachedShaders(program: WebGLProgram): WebGLShader[] | null; npm warn tar /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/getAttribLocation) */ npm warn tar getAttribLocation(program: WebGLProgram, name: string): GLint; npm warn tar /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/getBufferParameter) */ npm warn tar getBufferParameter(target: GLenum, pname: GLenum): any; npm warn tar /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/getContextAttributes) */ npm warn tar getContextAttributes(): WebGLContextAttributes | null; npm warn tar /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/getError) */ npm warn tar getError(): GLenum; npm warn tar /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/getExtension) */ npm warn tar getExtension(name: string): any; npm warn tar getExtension(extensionName: \"ANGLE_instanced_arrays\"): ANGLE_instanced_arrays | null; npm warn tar getExtension(extensionName: \"EXT_blend_minmax\"): EXT_blend_minmax | null; npm warn tar getExtension(extensionName: \"EXT_color_buffer_float\"): EXT_color_buffer_float | null; npm warn tar getExtension(extensionName: \"EXT_color_buffer_half_float\"): EXT_color_buffer_half_float | null; npm warn tar getExtension(extensionName: \"EXT_float_blend\"): EXT_float_blend | null; npm warn tar getExtension(extensionName: \"EXT_frag_depth\"): EXT_frag_depth | null; npm warn tar getExtension(extensionName: \"EXT_sRGB\"): EXT_sRGB | null; npm warn tar getExtension(extensionName: \"EXT_shader_texture_lod\"): EXT_shader_texture_lod | null; npm warn tar getExtension(extensionName: \"EXT_texture_compression_bptc\"): EXT_texture_compression_bptc | null; npm warn tar getExtension(extensionName: \"EXT_texture_compression_rgtc\"): EXT_texture_compression_rgtc | null; npm warn tar getExtension(extensionName: \"EXT_texture_filter_anisotropic\"): EXT_texture_filter_anisotropic | null; npm warn tar getExtension(extensionName: \"KHR_parallel_shader_compile\"): KHR_parallel_shader_compile | null; npm warn tar getExtension(extensionName: \"OES_element_index_uint\"): OES_element_index_uint | null; npm warn tar getExtension(extensionName: \"OES_fbo_render_mipmap\"): OES_fbo_render_mipmap | null; npm warn tar getExtension(extensionName: \"OES_standard_derivatives\"): OES_standard_derivatives | null; npm warn tar getExtension(extensionName: \"OES_texture_float\"): OES_texture_float | null; npm warn tar getExtension(extensionName: \"OES_texture_float_linear\"): OES_texture_float_linear | null; npm warn tar getExtension(extensionName: \"OES_texture_half_float\"): OES_texture_half_float | null; npm warn tar getExtension(extensionName: \"OES_texture_half_float_linear\"): OES_texture_half_float_linear | null; npm warn tar getExtension(extensionName: \"OES_vertex_array_object\"): OES_vertex_array_object | null; npm warn tar getExtension(extensionName: \"OVR_multiview2\"): OVR_multiview2 | null; npm warn tar getExtension(extensionName: \"WEBGL_color_buffer_float\"): WEBGL_color_buffer_float | null; npm warn tar getExtension(extensionName: \"WEBGL_compressed_texture_astc\"): WEBGL_compressed_texture_astc | null; npm warn tar getExtension(extensionName: \"WEBGL_compressed_texture_etc\"): WEBGL_compressed_texture_etc | null; npm warn tar getExtension(extensionName: \"WEBGL_compressed_texture_etc1\"): WEBGL_compressed_texture_etc1 | null; npm warn tar getExtension(extensionName: \"WEBGL_compressed_texture_pvrtc\"): WEBGL_compressed_texture_pvrtc | null; npm warn tar getExtension(extensionName: \"WEBGL_compressed_texture_s3tc\"): WEBGL_compressed_texture_s3tc | null; npm warn tar getExtension(extensionName: \"WEBGL_compressed_texture_s3tc_srgb\"): WEBGL_compressed_texture_s3tc_srgb | null; npm warn tar getExtension(extensionName: \"WEBGL_debug_renderer_info\"): WEBGL_debug_renderer_info | null; npm warn tar getExtension(extensionName: \"WEBGL_debug_shaders\"): WEBGL_debug_shaders | null; npm warn tar getExtension(extensionName: \"WEBGL_depth_texture\"): WEBGL_depth_texture | null; npm warn tar getExtension(extensionName: \"WEBGL_draw_buffers\"): WEBGL_draw_buffers | null; npm warn tar getExtension(extensionName: \"WEBGL_lose_context\"): WEBGL_lose_context | null; npm warn tar getExtension(extensionName: \"WEBGL_multi_draw\"): WEBGL_multi_draw | null; npm warn tar /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/getFramebufferAttachmentParameter) */ npm warn tar getFramebufferAttachmentParameter(target: GLenum, attachment: GLenum, pname: GLenum): any; npm warn tar /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/getParameter) */ npm warn tar getParameter(pname: GLenum): any; npm warn tar /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/getProgramInfoLog) */ npm warn tar getProgramInfoLog(program: WebGLProgram): string | null; npm warn tar /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/getProgramParameter) */ npm warn tar getProgramParameter(program: WebGLProgram, pname: GLenum): any; npm warn tar /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/getRenderbufferParameter) */ npm warn tar getRenderbufferParameter(target: GLenum, pname: GLenum): any; npm warn tar /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/getShaderInfoLog) */ npm warn tar getShaderInfoLog(shader: WebGLShader): string | null; npm warn tar /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/getShaderParameter) */ npm warn tar getShaderParameter(shader: WebGLShader, pname: GLenum): any; npm warn tar /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/getShaderPrecisionFormat) */ npm warn tar getShaderPrecisionFormat(shadertype: GLenum, precisiontype: GLenum): WebGLShaderPrecisionFormat | null; npm warn tar /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/getShaderSourcD^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@^@ [ng new] > npx > create my-ng-app --skip-install --skip-git --defaults [ng new] Error: child_process.spawnSync is not implemented yet (needs a synchronous kernel bridge) at http://localhost:5184/@fs/home/ddn9hc/workspace/duck/webcontainer/packages/core/dist/workers/process/worker.js:7346:11 at eval (dwc://module/home/user/.npm/_npx/5b5a2fdb7ee15b24/node_modules/@angular/create/src/index.js:25:54) at loadModule (http://localhost:5184/@fs/home/ddn9hc/workspace/duck/webcontainer/packages/core/dist/workers/process/worker.js:22680:7) at Object.run (http://localhost:5184/@fs/home/ddn9hc/workspace/duck/webcontainer/packages/core/dist/workers/process/worker.js:22702:14) at boot (http://localhost:5184/@fs/home/ddn9hc/workspace/duck/webcontainer/packages/core/dist/workers/process/worker.js:23317:24) at self.onmessage (http://localhost:5184/@fs/home/ddn9hc/workspace/duck/webcontainer/packages/core/dist/workers/process/worker.js:23341:35) [ng new] npm error code 1 [ng new] npm error path / [ng new] npm error command failed [ng new] npm error command sh -c create my-ng-app --skip-install --skip-git --defaults [ng new] [ng new] [ng new] exit=1"
```

# Test source

```ts
  1  | import { expect, test } from "@playwright/test";
  2  | 
  3  | // Same shape as examples/playground/e2e/boot.spec.ts: a real `npm create
  4  | // @angular@latest`, a real `npm install` against the real registry (with the
  5  | // esbuild-wasm/@rollup/wasm-node/Rolldown overrides applied), and a real
  6  | // `ng serve` whose dev server is previewed through the sandbox's Service
  7  | // Worker relay. Several minutes, dominated by the real npm install.
  8  | test.setTimeout(10 * 60 * 1000);
  9  | 
  10 | test("the angular playground scaffolds a real Angular app, installs it, and shows a real dev-server preview", async ({
  11 |   page,
  12 | }) => {
  13 |   const pageErrors: string[] = [];
  14 |   page.on("pageerror", (error) => pageErrors.push(error.message));
  15 | 
  16 |   await page.goto("/");
  17 | 
> 18 |   await expect(page.locator("#terminal")).toContainText("[ng new] exit=0", { timeout: 90_000 });
     |                                           ^ Error: expect(locator).toContainText(expected) failed
  19 |   await expect(page.locator("#terminal")).toContainText("[npm install] exit=0", { timeout: 5 * 60_000 });
  20 |   await expect(page.locator("#terminal")).toContainText("[preview] iframe.src ->", { timeout: 3 * 60_000 });
  21 | 
  22 |   const terminalText = await page.locator("#terminal").innerText();
  23 |   expect(terminalText).not.toContain("RuntimeError");
  24 |   expect(terminalText).not.toContain("Cannot find module");
  25 | 
  26 |   expect(pageErrors).toEqual([]);
  27 | });
  28 | 
```