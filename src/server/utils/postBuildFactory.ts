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

    const user_token = process.env.USER_TOKEN as string;
    const { vector_space_id } = config;

    debugInfo("gathering documents");

    const data = processDocInfos(buildData, config);

    debugInfo("clearing vector space");
    await clearVectorSpace(vector_space_id, user_token)

    for (const { paths } of data) {
      // Use scanDocuments to get content and metadata
      const documentsLists = await scanDocuments(paths, config);

       // [0] title [1] heading [2] content
    const titleDocuments = documentsLists[0];
    const headingDocuments = documentsLists[1];
    const contentDocuments = documentsLists[2];

    for (const doc of contentDocuments) {
      // Find the associated title and heading for the current content doc
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
        // Call ingestToVecto with formatted data
        await ingestToVecto(vector_space_id, user_token, formattedData);
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
              const matchedPath = searchContextByPaths.find(
                (path) => uri === path || uri.startsWith(`${path}/`)
              );
              if (matchedPath) {
                let dirAllDocs = docsByDirMap.get(matchedPath);
                if (!dirAllDocs) {
                  dirAllDocs = [];
                  docsByDirMap.set(matchedPath, dirAllDocs);
                }
                let dirDocs = dirAllDocs[docIndex];
                if (!dirDocs) {
                  dirAllDocs[docIndex] = dirDocs = [];
                }
                dirDocs.push(doc);
                if (!useAllContextsWithNoSearchContext) {
                  continue;
                }
              }
            }
            rootAllDocs[docIndex].push(doc);
          }
          docIndex++;
        }
        for (const [k, v] of docsByDirMap) {
          const docsNotEmpty = v.filter((d) => !!d);
          if (docsNotEmpty.length < v.length) {
            docsByDirMap.set(k, docsNotEmpty);
          }
        }
      } else {
        docsByDirMap.set("", allDocuments);
      }

      for (const [k, allDocs] of docsByDirMap) {
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
