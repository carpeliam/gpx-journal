import fs from 'fs';
import { read as readExif } from 'fast-exif';
import exiftool from 'exiftool';
import type { CreateNodeArgs, GatsbyNode } from 'gatsby';
import { parse as parseExifDate } from 'exif-date';

type SiteNode = Record<string, unknown> & {
  frontmatter: {
    title: string;
  }
  absolutePath: string;
  extension: string;
}

export const onCreateNode: GatsbyNode["onCreateNode"] = async ({ node, actions }: CreateNodeArgs<SiteNode>) => {
  const { createNodeField } = actions
  if (node.internal.type === 'File' && node.sourceInstanceName === 'images') {
    if (node.extension === 'mp4') {
      fs.readFile(node.absolutePath, function (err, data) {
        if (err)
          console.error(err);
        else {
          exiftool.metadata(data, ['-gpsLatitude', '-gpsLongitude', '-creationDate'], (err, { gpsLatitude, gpsLongitude, creationDate }) => {
            if (err)
              console.error(err);
            else {
              if (creationDate) {
                createNodeField({
                  node,
                  name: 'createDate',
                  value: parseExifDate(creationDate),
                });
              }
              if (gpsLatitude && gpsLongitude) {
                // console.log(node.birthTime, node.base, gpsLatitude, degreesMinutesSecondsStringToLatLng(gpsLatitude), gpsLongitude, degreesMinutesSecondsStringToLatLng(gpsLongitude));
                createNodeField({
                  node,
                  name: 'coordinates',
                  value: {
                    latitude: degreesMinutesSecondsStringToLatLng(gpsLatitude),
                    longitude: degreesMinutesSecondsStringToLatLng(gpsLongitude),
                  }
                });
              } else {
                console.debug('no GPS data for', node.relativePath, creationDate);
              }
            }
          });
        }
      });
    } else {
      const exif = await readExif(node.absolutePath).catch((e) => { console.error('Failed to read', node.relativePath) });
      
      if (exif?.exif?.DateTimeOriginal) {
        createNodeField({
          node,
          name: 'createDate',
          value: exif.exif.DateTimeOriginal,
        });
      }
      if (exif?.gps) {
        createNodeField({
          node,
          name: 'coordinates',
          value: {
            latitude: decimalLatitudeFor(exif.gps),
            longitude: decimalLongitudeFor(exif.gps),
          }
        });
      } else {
        console.debug('no GPS data for', node.relativePath, exif?.exif?.DateTimeOriginal);
      }
    }
  }
}

export const onCreateWebpackConfig: GatsbyNode["onCreateWebpackConfig"] = ({ stage, loaders, actions }) => {
  if (stage === "build-html" || stage === "develop-html") {
    actions.setWebpackConfig({
      module: {
        rules: [
          {
            test: /react-leaflet-cluster/,
            use: loaders.null(),
          },
        ],
      },
    });
  }
}

function degreesMinutesSecondsStringToLatLng(dms: string): number | undefined {
  const [_whole, degrees, minutes, seconds, direction] = dms.match(/(\d+) deg (\d+)' (\d+.?\d+)" ([NSEW])/)!;
  const degreesMinutesSeconds = [degrees, minutes, seconds].map(parseFloat);
  if (['N', 'S'].includes(direction)) {
    return decimalLatitudeFor({ GPSLatitudeRef: direction, GPSLatitude: degreesMinutesSeconds });
  } else if (['E', 'W'].includes(direction)) {
    return decimalLongitudeFor({ GPSLongitudeRef: direction, GPSLongitude: degreesMinutesSeconds });
  }
  console.debug('no coordinates determined for', dms);
}

function degreesMinutesSecondsToDecimal([degrees, minutes, seconds]: number[]) {
  return degrees + (minutes / 60) + (seconds / 3600);
}

function decimalLatitudeFor(gps: Record<string, unknown>) {
  if (gps?.GPSLatitude) {
    const decimal = degreesMinutesSecondsToDecimal(gps.GPSLatitude as number[]);
    return (gps.GPSLatitudeRef === 'N') ? decimal : -decimal;
  } else {
    console.debug('no latitude for', gps);
  }
}

function decimalLongitudeFor(gps: Record<string, unknown>) {
  if (gps?.GPSLongitude) {
    const decimal = degreesMinutesSecondsToDecimal(gps.GPSLongitude as number[]);
    return (gps.GPSLongitudeRef === 'E') ? decimal : -decimal;
  } else {
    console.log('no longitude for', gps);
  }
}
