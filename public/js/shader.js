const canvas = document.getElementById('myCanvas');
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isMobile = window.innerWidth < 768;
const DISABLED = !canvas || prefersReducedMotion;

if (DISABLED) {
  if (canvas) canvas.style.display = 'none';
} else {
  const gl = canvas.getContext('webgl2', {
    antialias: false,
    preserveDrawingBuffer: false,
    powerPreference: 'low-power'
  });
  if (!gl) {
    canvas.style.display = 'none';
  } else {

const vertexShaderSource = `#version 300 es

in vec2 a_position;

void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

    // Lower quality on mobile for performance
    const LOW_QUALITY = isMobile;

    let fragmentShaderSource = `#version 300 es

precision highp float;

uniform vec2 iResolution; // Declare as vec2 (canvas width and height)
uniform vec2 iMouse;
uniform float iTime;

out vec4 fragColor;

// Shadertoy code here

// The transparency and refraction formulas were borrowed & adapted from this demo:
// https://codepen.io/atzedent/full/eYKPGQr
// by Matthias Hurrle

#define rot(a) mat2(cos(a-vec4(0,11,33,0)))
#define sin36 0.58778525229
#define cos36 0.80901699437
#define sin72 0.95105651629
#define cos72 0.30901699437
#define PI 3.14159265359

float pyr(vec3 p, float i, float r) { // two conjoined/intersecting pentagon-based pyramids

  float d12 = 0.;
  p.z = abs(p.z);
  float o = p.y*i; // incline between the p.x and the p.y axis, multiplied by user-defined factor 
 
  d12 = max(d12, p.z*sin72 + abs(p.x*cos72 + o)); // creating the first set two mirrored walls of a pentagon
  d12 = max(d12, p.z*sin36 + abs(p.x*cos36 - o)); // creating the other two; now we have 4 of 5
  d12 = max(d12, abs(p.x + o)) - r; // the fifth
  d12/=1.4142;

  return d12;
}

float map(vec3 p) {
  float i = .5; // inclination factor
  float r = 1.; // radius

  // shorter rotation syntax but doesn't look right
  // p.xy = iMouse.z < 0. ? p.xy*=rot(iTime/4.) : p.xy*=rot(PI/-2.*iMouse.y/iResolution.y);
  // p.xz = iMouse.z < 0. ? p.xz*=rot(iTime/4.) : p.xz*=rot(PI*iMouse.x/iResolution.x);

  float angleX = -PI*2.*iMouse.x/iResolution.x;
  float angleY = -PI*iMouse.y/iResolution.y;

  if (iMouse.x < 1.) { // if LMB not pressed
    // Smoother rotation with slightly different speeds for natural movement
    angleX = iTime * 0.25;
    angleY = iTime * 0.25;
  }

  p.yz*=rot(angleY);
  p.xy*=rot(angleX);


  float d12 = pyr(p,i,r); // the first two mirrored peaks of the Great Dodecahedron
  float new; // the variable for all others, which will be created in a loop

  vec3 p0; // creating a reset point for the transforms to start from
  p.x = -p.x;

  int ki;

  for (;ki<5;ki++) { // using int not float here, bc it fails to render loop copies on Safari
    float k = float(ki); // converting that to a float
    p0 = p;
    p.xz*=rot(PI/2.5*k); // rotating incrementally by 72deg
    p.xy*=rot(PI*-0.352416382); // rotating by -63.4349488deg (not incrementally, same on each loop) 

    new = pyr(p,i,r); // creating the new two peaks   

    d12 = min(d12, new); // adding to the previous

    p = p0; // resetting coordinate system
  }

  return d12; // behold: the Great Dodecahedron
}

vec3 norm(vec3 p) {
  vec2 e = vec2(5e-4, 0); // Smaller epsilon for more accurate normals
  float d = map(p);
  vec3 n = d-vec3(
    map(p-e.xyy),
    map(p-e.yxy),
    map(p-e.yyx)
  );

  return normalize(n);
}

vec3 dir(vec2 uv, vec3 ro, vec3 t, float z) {
  vec3 up = vec3(0, 1, 0),
  f = normalize(t-ro),
  r = normalize(cross(up, f)),
  u = cross(f, r),
  c = f*z,
  i = c+uv.x*r+uv.y*u,
  d = normalize(i);

  return d;
}

// Simple anti-aliasing function
vec3 render(vec2 uv) {
  vec3 col = vec3(0),
  ro = vec3(0, 0, -4.75);

  vec3 rd = dir(uv, ro, vec3(0), 1.),
  p = ro;

  vec3 tint = vec3(-rd*cos(iTime/5.) - .5);
  float i,
  at = .0,
  side = 1.;
  for (; i < 64.; i++) { // Will be reduced on mobile
    float d = map(p)*side;

    if (d < 1e-3) { // Slightly higher threshold for consistent performance
      vec3 n = norm(p)*side,
      l = normalize(ro - (5.)),
      r = normalize(rd);

      if (dot(l, n) < .0) l = -l;

      vec3 h = normalize(l-r);

      float fres = pow(1.-max(.0, dot(-rd, n)), 5.),
      diff = pow(max(.0, dot(l, n)), 4.);

      col += diff * 0.4; // soft matte-style light

      side*=-1.;

      vec3 rdo = refract(rd, n, 1.+.45*side);
      if (dot(rdo, rdo) == .0) {
        rdo = reflect(rd, n);
      }

      rd = rdo;
      d = 9e-2;
    }

    if (d > 20.) break;

    p += rd*d;
    at += .1*(.1/d);
  }
  col += at*.001+i/800.;
  col = mix(col,tint*1.25,.4);
  
  return col;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = (
    fragCoord.xy -.5 * iResolution.xy
  ) / min(iResolution.x, iResolution.y);

  vec3 col = render(uv);

  fragColor = vec4(col, 1.0);
}

// Shadertoy code ends here

void main() {
    mainImage(fragColor, gl_FragCoord.xy);
}

`;

    if (LOW_QUALITY) {
      fragmentShaderSource = fragmentShaderSource
        .replace('for (; i < 64.; i++)', 'for (; i < 28.; i++)');
    }

const vertexShader = gl.createShader(gl.VERTEX_SHADER);
gl.shaderSource(vertexShader, vertexShaderSource);
gl.compileShader(vertexShader);  


const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
gl.shaderSource(fragmentShader, fragmentShaderSource);
gl.compileShader(fragmentShader);

const  
 program = gl.createProgram();
gl.attachShader(program, vertexShader);
gl.attachShader(program, fragmentShader);
gl.linkProgram(program);
gl.useProgram(program);  


const positions = [
    -1.0, -1.0,
    1.0, -1.0,
    -1.0, 1.0,
    1.0, 1.0,
];

const positionBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
gl.bufferData(gl.ARRAY_BUFFER, new  
 Float32Array(positions), gl.STATIC_DRAW);

const positionAttributeLocation = gl.getAttribLocation(program, 'a_position');
gl.enableVertexAttribArray(positionAttributeLocation);  

gl.vertexAttribPointer(positionAttributeLocation, 2, gl.FLOAT, false, 0, 0);  


const iResolutionLocation = gl.getUniformLocation(program, 'iResolution');
const iMouseLocation = gl.getUniformLocation(program, 'iMouse');
const iTimeLocation = gl.getUniformLocation(program, 'iTime');

    function resizeCanvas() {
      const scale = LOW_QUALITY ? 0.5 : Math.min(window.devicePixelRatio || 1, 1.25);
      canvas.width = Math.floor(window.innerWidth * scale);
      canvas.height = Math.floor(window.innerHeight * scale);
      canvas.style.width = '100vw';
      canvas.style.height = '100vh';
    }

    window.addEventListener('resize', resizeCanvas);  
    resizeCanvas();

let isMouseDown = false;
let mouseX = 0; // Store the last mouse X position
let mouseY = 0; // Store the last mouse Y position

    canvas.addEventListener('mousedown', (event) => {
    isMouseDown = true;
});

    canvas.addEventListener('mouseup', (event) => {
    isMouseDown = false;
    // Optional: Reset mouse position in the shader when the button is released.
    // This is important to stop any lingering movement in the shader.
     gl.uniform2f(iMouseLocation, -1, -1); // Or some other "out of bounds" value.

    mouseX = -1; //reset mouse position
    mouseY = -1;
});

    canvas.addEventListener('mouseout', (event) => {
    isMouseDown = false;
    gl.uniform2f(iMouseLocation, -1, -1); // Reset in shader as well
    mouseX = -1; //reset mouse position
    mouseY = -1;
});

    canvas.addEventListener('mousemove', (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = canvas.height - (event.clientY - rect.top);

    mouseX = x;
    mouseY = y;

    if (isMouseDown) {
    gl.uniform2f(iMouseLocation, x, y);
    } else {
        // Maintain a "resting" value in the shader, or set it to a specific value.
        gl.uniform2f(iMouseLocation, -1, -1); // Or some other "out of bounds" value.
    }
});

// Smooth timing system
let startTime = null;
let lastFrameTime = 0;
let smoothTime = 0;

    function render(timestamp) {
    if (!startTime) {
        startTime = timestamp;
    }
    
    // Calculate smooth delta time
    const currentTime = (timestamp - startTime) * 0.001;
    const deltaTime = currentTime - lastFrameTime;
    lastFrameTime = currentTime;
    
    // Smooth the time progression to eliminate jitters
    smoothTime += deltaTime;
    
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.uniform2f(iResolutionLocation, canvas.width, canvas.height);
    gl.uniform1f(iTimeLocation, smoothTime);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // Lower frame rate on mobile to ~30fps
      if (LOW_QUALITY) {
        setTimeout(() => requestAnimationFrame(render), 1000/30);
      } else {
        requestAnimationFrame(render);
      }
    }

    document.addEventListener('DOMContentLoaded', () => {
      document.body.classList.add('gl-ready');
      setTimeout(() => {
          canvas.classList.add('fade-in');
      }, 100);
    });

    requestAnimationFrame(render);
  }
}