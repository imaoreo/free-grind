import tailwindcss from "@tailwindcss/postcss";
import cascadeLayers from "@csstools/postcss-cascade-layers";

export default {
	plugins: [tailwindcss(), cascadeLayers()],
};
