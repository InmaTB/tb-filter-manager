/*
  Warnings:

  - A unique constraint covering the columns `[collectionId]` on the table `CollectionFilterIndex` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "CollectionFilterIndex_collectionId_key" ON "CollectionFilterIndex"("collectionId");
