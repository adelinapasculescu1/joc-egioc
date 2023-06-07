const {mat3, mat4, vec3, vec4} = glMatrix;

let canvas;
let gl;

let viewMatrix;
let orthogonalProjectionMatrix;
let perspectiveProjectionMatrix;

let shaderPrograms = [];
let tetracubes = [];
let boundingBox;
let grid3D;

let lightIntensity = vec4.fromValues(1.0, 1.0, 1.0, 1.0);
let materialKa = 0.1;
let materialKd = 1.0;
let materialKs = 1.0;
let materialShininess = 20.0;

let ambientProduct = vec4.create();
let diffuseProduct = vec4.create();
let specularProduct = vec4.create();

let sliderMaterialKa;
let sliderMaterialKd;
let sliderMaterialKs;

let modelViewMatrixLocation;
let projectionMatrixLocation;
let normalMatrixLocation;
let ambientProductLocation;
let diffuseProductLocation;
let specularProductLocation;
let materialShininessLocation;


window.onload = function init() {
    canvas = document.createElement('canvas');
    canvas.width = 550;
    canvas.height = 850;
    document.querySelector('body').appendChild(canvas);   
    gl = canvas.getContext('webgl');                        

    if (!gl) {
        alert("WebGL isn't supported by this browser.")
    }

    sliderMaterialKa = document.getElementById("materialKa");
    sliderMaterialKd = document.getElementById("materialKd");
    sliderMaterialKs = document.getElementById("materialKs");

    sliderMaterialKa.oninput = function() {
        materialKa = sliderMaterialKa.value / 100;
    }
    sliderMaterialKd.oninput = function() {
        materialKd = sliderMaterialKd.value / 100;
    }
    sliderMaterialKs.oninput = function() {
        materialKs = sliderMaterialKs.value / 100;
    }

    gl.viewport(0, 0, canvas.width, canvas.height);   
    gl.clearColor(0, 0, 0, 1.0);         
    gl.enable(gl.DEPTH_TEST);     

    initShaderPrograms();

    viewMatrix = initViewMatrix();            
    initProjectionMatrices();                 
    initEventListeners();
    initGame();
    render();
}


function initViewMatrix() {
    const viewMatrix = mat4.create();
    mat4.lookAt(viewMatrix, defaultCameraPosition, [0, 0, 0], [0, 1, 0]);

    return viewMatrix;
}


function initProjectionMatrices() {
    const aspectRatio = canvas.width / canvas.height;
    const fovVertical = glMatrix.glMatrix.toRadian(60);

    orthogonalProjectionMatrix = mat4.create();
    mat4.ortho(orthogonalProjectionMatrix, -aspectRatio, aspectRatio, -1, 1, 1, 100);

    perspectiveProjectionMatrix = mat4.create();
    mat4.perspective(perspectiveProjectionMatrix, fovVertical, aspectRatio, 1, 100);
}


function initShaderPrograms() {
    let shaderProgramNoShading = initShaders(gl, "vertexShaderNoShading", "fragmentShaderNoShading");
    let shaderProgramGouraud = initShaders(gl, "vertexShaderGouraud", "fragmentShaderGouraud");
    let shaderProgramPhong = initShaders(gl, "vertexShaderPhong", "fragmentShaderPhong");
    shaderPrograms.push(shaderProgramNoShading, shaderProgramGouraud, shaderProgramPhong);
}


function updateShadingCoefficients() {
    vec4.scale(ambientProduct, lightIntensity, materialKa);
    vec4.scale(diffuseProduct, lightIntensity, materialKd);
    vec4.scale(specularProduct, lightIntensity, materialKs);

    gl.uniform4fv(ambientProductLocation, ambientProduct);
    gl.uniform4fv(diffuseProductLocation, diffuseProduct);
    gl.uniform4fv(specularProductLocation, specularProduct);
}


function switchShaderProgram(shaderProgramIndex) {
    let shaderProgram = shaderPrograms[shaderProgramIndex];
    gl.useProgram(shaderProgram); 

    modelViewMatrixLocation = gl.getUniformLocation(shaderProgram, "modelViewMatrix");
    projectionMatrixLocation = gl.getUniformLocation(shaderProgram, "projectionMatrix");

    let projectionMatrix = isProjectionOrthogonal ? orthogonalProjectionMatrix : perspectiveProjectionMatrix;
    gl.uniformMatrix4fv(projectionMatrixLocation, false, projectionMatrix);

    if(shaderProgramIndex !== 0) {
        normalMatrixLocation = gl.getUniformLocation(shaderProgram, "normalMatrix");

        ambientProductLocation = gl.getUniformLocation(shaderProgram, "ambientProduct");
        diffuseProductLocation = gl.getUniformLocation(shaderProgram, "diffuseProduct");
        specularProductLocation = gl.getUniformLocation(shaderProgram, "specularProduct");
        materialShininessLocation = gl.getUniformLocation(shaderProgram, "shininess");

        gl.uniform1f(materialShininessLocation, materialShininess);
    }
}


function prepareBuffers(cube) {
    gl.bindBuffer(gl.ARRAY_BUFFER, cube.vertexBuffer);
    let vPosition = gl.getAttribLocation(shaderPrograms[selectedShaderProgram], "vPosition");
    gl.vertexAttribPointer(vPosition, 4, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vPosition);

    gl.bindBuffer(gl.ARRAY_BUFFER, cube.colorBuffer);
    let vColor = gl.getAttribLocation(shaderPrograms[selectedShaderProgram], "vColor");
    gl.vertexAttribPointer(vColor, 4, gl.FLOAT, false, 0, 0 );
    gl.enableVertexAttribArray(vColor);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cube.indexBuffer);

    if(cube.normalBuffer !== undefined) {
        gl.bindBuffer(gl.ARRAY_BUFFER, cube.normalBuffer);
        // Attribute
        let vNormal = gl.getAttribLocation(shaderPrograms[selectedShaderProgram], "vNormal");
        gl.vertexAttribPointer(vNormal, 3, gl.FLOAT, false, 0, 0 );
        gl.enableVertexAttribArray(vNormal);
    }
}


function render() {
    let modelViewMatrix = mat4.create();

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);   

    updateShadingCoefficients();

    switchShaderProgram(0);        

    mat4.multiply(modelViewMatrix, viewMatrix, boundingBox.modelMatrix);
    gl.uniformMatrix4fv(modelViewMatrixLocation, false, modelViewMatrix);
    prepareBuffers(boundingBox);
    gl.drawElements(gl.LINES, boundingBox.indices.length, gl.UNSIGNED_SHORT, 0);

    if(gridEnabled) {
        mat4.multiply(modelViewMatrix, viewMatrix, grid3D.modelMatrix);
        gl.uniformMatrix4fv(modelViewMatrixLocation, false, modelViewMatrix);
        prepareBuffers(grid3D);
        gl.drawElements(gl.LINES, grid3D.indices.length, gl.UNSIGNED_SHORT, 0);
    }

    switchShaderProgram(selectedShaderProgram);    

    tetracubes.forEach(tetracube => {
        tetracube.cubes.forEach(cube => {
            let modelMatrix = mat4.create();
            mat4.multiply(modelMatrix, tetracube.modelMatrix, cube.modelMatrix);
            mat4.multiply(modelViewMatrix, viewMatrix, modelMatrix);

            let normalMatrix = mat3.create();
            mat3.normalFromMat4(normalMatrix, modelViewMatrix);    

            gl.uniformMatrix4fv(modelViewMatrixLocation, false, modelViewMatrix);  
            gl.uniformMatrix3fv(normalMatrixLocation, false, normalMatrix);        

            prepareBuffers(cube);

            gl.drawElements(gl.TRIANGLES, cube.indices.length, gl.UNSIGNED_SHORT, 0);    
        });
    });

    progressGame();

    requestAnimationFrame(render); 
}

