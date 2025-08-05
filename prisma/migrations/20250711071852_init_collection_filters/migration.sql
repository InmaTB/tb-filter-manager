-- CreateTable
CREATE TABLE "CollectionFilterIndex" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "collectionId" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "metafields" JSONB NOT NULL,
    "updatedAt" DATETIME NOT NULL
);
