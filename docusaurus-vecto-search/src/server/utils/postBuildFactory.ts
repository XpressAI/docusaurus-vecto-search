import fs from "fs";
import path from "path";
import util from "util";
import {
  ProcessedPluginOptions,
  PostBuildData,
  SearchDocument,
} from "../../shared/interfaces";
import { buildIndex } from "./buildIndex";
import { debugInfo } from "./debug";
import { processDocInfos } from "./processDocInfos";
import { scanDocuments } from "./scanDocuments";
import { ingestToVecto, clearVectorSpace } from "../../client/utils/vectoApiUtils";
import dotenv from 'dotenv';
dotenv.config();

const writeFileAsync = util.promisify(fs.writeFile);

export function postBuildFactory(
  config: ProcessedPluginOptions,
  searchIndexFilename: string
) {
  return async function postBuild(buildData: PostBuildData): Promise<void> {
    const user_token = process.env.VECTO_USER_TOKEN as string;
    const { vector_space_id } = config;

    debugInfo("gathering documents");

    const data = processDocInfos(buildData, config);

    // Vecto integration - clear and ingest documents
    if (user_token && vector_space_id) {
      debugInfo("clearing vector space");
      await clearVectorSpace(vector_space_id, user_token);

      for (const { paths } of data) {
        const documentsLists = await scanDocuments(paths, config);
        
        const titleDocuments = documentsLists[0];
        const contentDocuments = documentsLists[2];

        for (const doc of contentDocuments) {
          const associatedTitleDoc = titleDocuments.find(titleDoc => titleDoc.i === doc.p);

          const formattedData = {
            data: doc.t, 
            attributes: {
              data: doc.t, 
              title: doc.s,
              url: doc.u,
              hash: doc.h,
              pageTitle: associatedTitleDoc ? associatedTitleDoc.t : null,
              breadcrumb: associatedTitleDoc ? associatedTitleDoc.b : null,
            }
          };
          
          await ingestToVecto(vector_space_id, user_token, formattedData);
        }
      }
    }

    debugInfo("parsing documents");

    for (const versionData of data) {
      // Give every index entry a unique id so that the index does not need to store long URLs.
      const allDocuments = await scanDocuments(versionData.paths, config);

      debugInfo("building index");

      const docsByDirMap = new Map<string, SearchDocument[][]>();
      const {
        searchContextByPaths,
        hideSearchBarWithNoSearchContext,
        useAllContextsWithNoSearchContext,
      } = config;
      if (searchContextByPaths) {
        const { baseUrl } = buildData;
        const rootAllDocs: SearchDocument[][] = [];
        if (!hideSearchBarWithNoSearchContext) {
          docsByDirMap.set("", rootAllDocs);
        }
        let docIndex = 0;
        for (const documents of allDocuments) {
          rootAllDocs[docIndex] = [];
          for (const doc of documents) {
            if (doc.u.startsWith(baseUrl)) {
              const uri = doc.u.substring(baseUrl.length);
              const matchedPaths: string[] = [];
              for (const _path of searchContextByPaths) {
                const path = typeof _path === "string" ? _path : _path.path;
                if (uri === path || uri.startsWith(`${path}/`)) {
                  matchedPaths.push(path);
                }
              }
              for (const matchedPath of matchedPaths) {
                let dirAllDocs = docsByDirMap.get(matchedPath);
                if (!dirAllDocs) {
                  dirAllDocs = new Array(allDocuments.length);
                  docsByDirMap.set(matchedPath, dirAllDocs);
                }
                let dirDocs = dirAllDocs[docIndex];
                if (!dirDocs) {
                  dirAllDocs[docIndex] = dirDocs = [];
                }
                dirDocs.push(doc);
              }
              if (
                matchedPaths.length > 0 &&
                !useAllContextsWithNoSearchContext
              ) {
                continue;
              }
            }
            rootAllDocs[docIndex].push(doc);
          }
          docIndex++;
        }
      } else {
        docsByDirMap.set("", allDocuments);
      }

      for (const [k, allDocs] of Array.from(docsByDirMap.entries()).sort(([a], [b]) => a.localeCompare(b))) {
        const searchIndex = buildIndex(allDocs, config);

        debugInfo(`writing index (/${k}) to disk`);

        await writeFileAsync(
          path.join(
            versionData.outDir,
            searchIndexFilename.replace(
              "{dir}",
              k === "" ? "" : `-${k.replace(/\//g, "-")}`
            )
          ),
          JSON.stringify(searchIndex),
          { encoding: "utf8" }
        );

        debugInfo(`index (/${k}) written to disk successfully!`);
      }
    }
  };
}
