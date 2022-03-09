# GPU Fluid Simulation using Compute Shaders

## Preview

![This is a alt text.](/docs/FluidStart.gif "Fluid expand")
![This is a alt text.](/docs/MovingContainer1.gif "Move sideways")
![This is a alt text.](/docs/MovingContainer2.gif "Move all around")
![This is a alt text.](/docs/ShakeUpAndDown.gif "Shake up and down")

## Summary

Program built in a C++ Engine from scratch using SDL2, glew, OpenGL, glm and ImGui to name a few.  
  

This is the final project for my Advanced Rendering Techniques Course at Digipen Bilbao. The idea behind the assignment was to pick a paper of our choosing (related to the course's content) and implement it. In my case, I decided to do pick Fluid Simulation to learn how to work with Compute Shaders in a task where performance is key.   

The physics in the project are following mainly the work in Position Based Fluids. However, I also needed to check some of the predecesor papers: 

>1. Macklin, M., & Müller, M. (2013). Position based fluids. ACM Transactions on Graphics (TOG), 32(4), 1-12.
>1. Müller, M., Charypar, D., & Gross, M. (2003, July). Particle-based fluid simulation for interactive applications. In Proceedings of the 2003 ACM SIGGRAPH/Eurographics symposium on Computer animation (pp. 154-159).
>1. Monaghan, J. J. (1992). Smoothed particle hydrodynamics. Annual review of astronomy and astrophysics, 30(1), 543-574.

The details of the implementation (memory layout, specifics about compute shaders and rendering) were mostly home-brew so I cannot link a specific page to check the ideas. However, some of the key points that may be found interesting:

- The formulas that come from the original SPH (Smoothed particle hydrodynamics) help avoid checking all particles against all others. Instad, each particle should only check against particles in a radius.
- The particles may be sorted every frame in a uniform grid, based on their location.
- We should check collisions between particles within a cell and against the neighbouring 26 cells.
- We can benefit from the GPU parallelism when:
  - Updating the position of particles & Computing their cell
  - Reordering particle buffers to have particles within a cell contiguous in memory (Check atomicAdd in shaders)
  - Applying the physic equations to all particles

In the images below I am outputting the cell idx as a color in greyscale. As the reader may see, there are a lot of different cells containing few particles, this is ideal to avoid computing the expensive physics formulas as much as possible.

![This is a alt text.](/docs/CellData1.png "Neighbor data, starting")
![This is a alt text.](/docs/CellData2.png "Neighbor data, a bit more advanced")

<br>

## Some implementation details


**1. Memory layout**  
```
struct Particle
{
    vec3  position;
    float density_constraint;
    vec4  debug_color;
    vec3  velocity;
    float lambda;
    vec3  tentative_position;
    uint  cell_offset;
};

struct ParticleCellOut {
    uint count;
    uint offset;
    uint _pad1;
    uint _pad2;
};
```
Three main arrays; **two** for the particle data and **one** for the cell data. We will need two different arrays for particle data in order to use one as input and the other as output in some cases.
```
layout (std140, binding = 0) readonly buffer inputFluidData {
   Particle data[];
} inData;

layout (std140, binding = 1) writeonly buffer outputFluidData {
   Particle data[];
} outData;

layout (std140, binding = 2) readonly buffer outputCellData {
   uvec4 offsets;
   CellData data[];
} grid;
```
<br>

**2. Generating the buffers**

We want to generate buffers in such a way that the particle data is directly available for rendering when needed. Therefore, the GL_SHADER_STORAGE_BUFFER holding the particle data are also going to be part of the meshes.  
  
* Creating the Shader Storage buffers

```
glGenBuffers(2, mFluidData);
glBindBuffer(GL_SHADER_STORAGE_BUFFER, mFluidData[0]);
glBufferData(GL_SHADER_STORAGE_BUFFER, mMaxParticles * sizeof(Particle), NULL, GL_STATIC_DRAW);
glBindBuffer(GL_SHADER_STORAGE_BUFFER, mFluidData[1]);
glBufferData(GL_SHADER_STORAGE_BUFFER, mMaxParticles * sizeof(Particle), NULL, GL_STATIC_DRAW);
    
glGenBuffers(1, &mCellData);
glBindBuffer(GL_SHADER_STORAGE_BUFFER, mCellData);
glBufferData(GL_SHADER_STORAGE_BUFFER, (mMaxCells+1) * sizeof(unsigned) * 4, NULL, GL_STATIC_DRAW);
```

* Our particle model: A quad (Later detailed)
```
float particleQuadData[] = {
    -0.5,  0.5, 0.0,
    -0.5, -0.5, 0.0,
     0.5,  0.5, 0.0,
     0.5,  0.5, 0.0,
    -0.5, -0.5, 0.0,
     0.5, -0.5, 0.0,
};
glGenBuffers(1, &mParticleMesh);
glBindBuffer(GL_ARRAY_BUFFER, mParticleMesh);
glBufferData(GL_ARRAY_BUFFER, sizeof(particleQuadData), particleQuadData, GL_STATIC_DRAW);
```

* Generating the actual meshes & Linking the storage buffers

```
glGenVertexArrays(2, mFluidMesh);
for (int i = 0; i < 2; i++)
{
    // The particle mesh consists only on positions (a vec3)
    glBindVertexArray(mFluidMesh[i]);
    glBindBuffer(GL_ARRAY_BUFFER, mParticleMesh);
    glVertexAttribPointer(0, 3, GL_FLOAT, GL_FALSE, 0, NULL);           
    glEnableVertexAttribArray(0);

    // The per-instance data is a bit more complex, containing both a color and position
    glBindBuffer(GL_ARRAY_BUFFER, mFluidData[i]);
    ... (Set attribute info)
}
```

<br>

**3. Dividing tasks among threads**  

In this project we clearly need a way of subdiving the particles each thread should act on, to maximize spatial coherence and avoid overlap between threads.  
  
My way to go during the project was the following function. It computes where this instance (this thread) should start and end in an array of length "total_size" so that the workload is evenly distributed for the whole workgroup. It can be found in multiple cmpute shaders but I have copied it here so its easier to see:

```
void ComputeBoundary(uint total_size, out uint start, out uint end)
{
    // There will be partitions with 1 extra elements, this will be placed atan
    // the start. As an example, picture trying to divide 27 elements in 8 boxes:
    // |4|4|4|3|3|3|3|3|
    // Where elements 0 to 3 are in the first box, 4 to 7 in the second...

    // The quot will be the number of elements per partition by default and the quot
    // the number of partitions with one extra element
    // quot = 27/8 = 3;        
    // rest = 27%8 = 3;
    uint quot = total_size / (gl_WorkGroupSize.x * gl_NumWorkGroups.x);
    uint rest = total_size % (gl_WorkGroupSize.x * gl_NumWorkGroups.x);
    uint curr = gl_GlobalInvocationID.x;
    
    // Also, picture we are trying to compute the values for the cell 3:
    // |4|4|4|3|3|3|3|3|
    //      ^            
    // If all cell with extra elements have already been filled
    if (curr >= rest) {
        start = rest * (quot + 1) + (curr - rest) * quot;
        end = start + quot;
    }
    // If there are cells left to fill
    else {
        start = curr * (quot + 1);
        end = start + quot + 1;
    }
}
```

<br>

**4. Atomic Add**

As mentioned earlier, one of the main tasks each frame is to reorder the whole particle data in order to ensure that particles within the same cell are contiguous in memory.

For this purpose, we first need to figure out how many particles belong to each cell, so that we can compute their starting positions. To do so, we first do a pass through all particles, computing their new position and checking the cell they belong to.

Notice here the use of **atomicAdd** (second-to-last line), not only to ensure that the operation is thread safe, but also to retrieve the original value of the variable. This way, we know the current particle is the *i-th* particle that is set as "belongs to the *k-th* cell". Knowing this, once we compute the starting offsets for each cell, we can directly copy this particle to the location  *cell_offset(k) + i*;

<br>

data/fluid_shaders/apply_forces.comp

```
uint start, end;
ComputeBoundary(mParticleCount, start, end);
for (uint i = start; i < end; ++i) 
{
    // Compute the new position based on the force
    Particle p = inParticles.data[i];
    ApplyAcceleration(p);

    // Compute the idx in the cell array based on the position of the particle
    uint idx = CellIdx(CellCoords(p.tentative_position));

    // Increase the number of occurences
    p.cell_offset = atomicAdd(outCells.data[idx].count, 1);
    inParticles.data[i] = p;
}
```

data/fluid_shaders/compute_offsets.comp

```
uint start, end;
ComputeBoundary(mCellCount, start, end);
for (uint i = start; i < end; ++i) {
    // Initially: 
    //   - offsets = where last registered cell ends
    // After the operation:
    //   - offsets = where this cell ends (last cell + this count)
    //   - outCells.data[idx].offset = where this cell starts
    //   - outCells.data[idx].count  = number of particles
    outCells.data[i].offset = atomicAdd(outCells.offsets.x, outCells.data[i].count);
}
```

data/fluid_shaders/getneighbors.comp

```
uint start, end;
ComputeBoundary(mParticleCount, start, end);
for (uint i = start; i < end; ++i) 
{
    // Compute the cell the particle belongs to and get both the cell's offset
    // in the grid, and the particle's offset in the cell
    Particle p = inParticles.data[i];
    uint cell_idx       = CellIdx(CellCoords(p.tentative_position));
    uint cell_offset    = outCells.data[cell_idx].offset;
    uint particle_idx   = cell_offset + p.cell_offset;

    // Copy the particle
    outParticles.data[particle_idx] = p;
}
```
<br>


## Rendering particles

Instead of rendering particles, in this project I'm rendering quads. A single position is needed to render each quad, so its easy to do so in an instanced way. (Check the IMPORTANT comment)

**1. Instanced Rendering**

```
glm::mat4 World2View = mCamera.GetWorldToView();
glm::mat4 World2Proj = mCamera.GetCamToPerspective() * World2View;

mShaders[eShader::BasicFluidRender].Bind();  
glBindFramebuffer(GL_FRAMEBUFFER, 0);
glClear(GL_DEPTH_BUFFER_BIT);  

// IMPORTANT //
// Compute shaders act on memory within the FluidMesh //
glBindVertexArray(mFluidMesh[0]); 

glUniformMatrix4fv(0, 1, GL_FALSE, &World2Proj[0][0]);
glUniformMatrix4fv(1, 1, GL_FALSE, &World2View[0][0]);
glUniform1f(2, mParticleRadius);
glDrawArraysInstanced(GL_TRIANGLES, 0, 6, mParticleCount);
```
![This is a alt text.](/docs/RenderingBasic.png "Final Result")

**2. Billboarding**

```
// Extract the necessary vectors from the camera mtx
vec3 CamRightVec = normalize(vec3(World2View[0][0], World2View[1][0], World2View[2][0]));
vec3 CamUpVec    = normalize(vec3(World2View[0][1], World2View[1][1], World2View[2][1]));
  
// Get the final rotated version of the model space vtx andscale it appropiately
vec3 Rotated = (CamRightVec * aPos.x + CamUpVec * aPos.y) * mScale;
 
// Finally apply world to proj transforms to the rotated model
gl_Position = World2Proj * vec4(Rotated + iPos, 1.0);
```
![This is a alt text.](/docs/RenderingIntermediate.png "Final Result")

**3. Radius check**

Vertex shader:
```
layout (location = 0) in vec3 aPos;    // [-0.5, 0.5]
out vec2 uvs;

void main()
{
  ...
  uvs = 2*aPos.xy;
}
```

Fragment shader:
```
float r2 = dot(uvs, uvs);
if (r2 > 1.0) discard;
```
![This is a alt text.](/docs/RenderingLast.png "Final Result")

<br>

## Controls

<pre>
AWSDQE             = Move camera Following Forward, Right or World's Up Vector
Right Mouse click  = Rotate
Up/Down/Left/Right = Rotate too (Around Pitch and Yaw)
F5                 = Refresh shaders
Ctrl+R             = Reset Scene (Delete objects and creates them again)
</pre>
