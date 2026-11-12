import { strToU8, zipSync } from 'fflate';

/** Kleinste QGIS-Vorlage: zwei Layouts mit Kartenobjekt, zwei Kartenthemen */
export function vorlageQgs(layouts = ['Katasterauszug A4', 'Katasterauszug A3'], themen = ['Katasterplan', 'Schwarzplan']): string {
  return `<!DOCTYPE qgis PUBLIC 'http://mrcc.com/qgis.dtd' 'SYSTEM'>
<qgis projectname="" version="3.34.0-Prizren">
  <title>Kataster</title>
  <visibility-presets>${themen.map((t) => `<visibility-preset name="${t}"/>`).join('')}</visibility-presets>
  <Layouts>${layouts
    .map(
      (l, i) => `<Layout name="${l}" units="mm">
      <LayoutItem type="65638" id="" size="210,297,mm"/>
      <LayoutItem type="65641" id="" size="190,20,mm"/>
      <LayoutItem type="65639" id="${i ? '' : 'Karte'}" size="${i ? '400,277' : '190,190'},mm"/>
    </Layout>`,
    )
    .join('')}</Layouts>
</qgis>`;
}

export const vorlageQgz = (qgs = vorlageQgs()) => zipSync({ 'Kataster.qgs': strToU8(qgs), 'Kataster_styles.db': new Uint8Array([1, 2]) });
