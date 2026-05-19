import PhaserModule from "phaser/src/phaser-core.js";
import "phaser/src/gameobjects/container/ContainerFactory.js";
import "phaser/src/gameobjects/image/ImageFactory.js";
import "phaser/src/gameobjects/shape/arc/ArcFactory.js";
import "phaser/src/gameobjects/shape/ellipse/EllipseFactory.js";
import "phaser/src/gameobjects/shape/rectangle/RectangleFactory.js";
import "phaser/src/gameobjects/shape/triangle/TriangleFactory.js";
import "phaser/src/loader/filetypes/SVGFile.js";

const PhaserRuntime = PhaserModule as unknown as typeof import("phaser");

export default PhaserRuntime;
