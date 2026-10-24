---
categories: X++
tags: X++
description: "Merge DocuRef PDF attachments in X++ with PdfSharp, using the .NET Framework 4.7.2 build that Finance and Operations can reference."
---
## How to merge PDFs in X++ with PdfSharp
First, get the PdfSharp library. At the time of writing, X++ only supports libraries up to .NET Framework 4.7.2 (I really hope Microsoft targets a newer .NET version soon), so use the version linked here:
[PdfSharp 1.50.5147 nuget](https://www.nuget.org/packages/PdfSharp/1.50.5147)

If you need a starting point for referencing a .NET library from X++:
[.NET Interop from X++](https://learn.microsoft.com/en-us/previous-versions/dynamicsax-2012/developer/net-interop-from-x)

The class below takes the `DocuRef` records you want to merge into a single PDF. With PdfSharp, you can merge the PDF attachments of any record into one file.
```axapta
using PdfSharp.Pdf;
using PdfSharp.Pdf.IO;

using Microsoft.Dynamics.AX.Framework.FileManagement;

internal final class PDFMerger_BEC implements System.IDisposable
{
    List docuRefRecordList = new List(Types::Record);

    ListEnumerator docuRefRecordListEnumerator;

    System.IO.MemoryStream pdfMemoryStream;

    protected void new() { }

    public static PDFMerger_BEC construct()
    {
        return new PDFMerger_BEC();
    }

    public void appendDocuRef(DocuRef _docuRef)
    {
        docuRefRecordList.addEnd(_docuRef);
    }

    private boolean nextDocuRef()
    {
        if (! docuRefRecordListEnumerator)
        {
            docuRefRecordListEnumerator = docuRefRecordList.getEnumerator();
        }

        return docuRefRecordListEnumerator.moveNext();
    }

    private DocuRef currentDocuRef()
    {
        if (! docuRefRecordListEnumerator)
        {
            return null;
        }

        return docuRefRecordListEnumerator.current();
    }

    public void merge()
    {
        pdfMemoryStream = new System.IO.MemoryStream();

        using (PdfDocument mergedPdfDocument = new PdfDocument())
        {
            this.mergeAttachmentsToPDF(mergedPdfDocument);

            mergedPdfDocument.Save(pdfMemoryStream, false);
        }
    }

    private void mergeAttachmentsToPDF(PdfDocument _pdfDocument)
    {
        while (this.nextDocuRef())
        {
            DocuRef docuRef = this.currentDocuRef();
            if (! docuRef.isValueAttached())
            {
                continue;
            }

            DocuValue docuValue = docuRef.docuValue();
            if (docuValue.FileType != 'pdf')
            {
                continue;
            }

            var storageProvider = docuValue.getStorageProvider();
            if (! storageProvider)
            {
                continue;
            }

            var docContents = storageProvider.getFile(docuValue.createLocation());                
            using (var readDocument = PdfReader::Open(docContents.Content, PdfDocumentOpenMode::Import))
            {
                this.appendPagesToPDF(readDocument, _pdfDocument);
            }
        }
    }

    private void appendPagesToPDF(PdfDocument _fromDocument, PdfDocument _toDocument)
    {
        var pages = _fromDocument.Pages;
        var pageEnumerator = pages.GetEnumerator();

        while (pageEnumerator.MoveNext())
        {
            _toDocument.AddPage(pageEnumerator.Current);
        }
    }

    public System.IO.MemoryStream getFileStream()
    {
        return pdfMemoryStream;
    }

    public void dispose()
    {
        pdfMemoryStream.Dispose();
    }
}
```

And here is a snippet that uses `PDFMerger_BEC`:
```axapta
internal final class PDFTest_BEC
{
    public static void main(Args _args)
    {
        Dialog dlg = new Dialog();

        DialogField dfItem = dlg.addField(identifierStr(ItemId));
        DialogField dfDocuTypeId = dlg.addField(identifierStr(DocuTypeId));

        if (!dlg.run())
        {
            return;
        }
        
        InventTable inventTable = InventTable::find(dfItem.value());
        DocuRefSearch search = DocuRefSearch::newDocuTypeId(inventTable, dfDocuTypeId.value());

        using (PDFMerger_BEC pdfMerger = PDFMerger_BEC::construct())
        {
            while (search.next())
            {
                pdfMerger.appendDocuRef(search.docuRef());
            }

            pdfMerger.merge();

            File::SendFileToUser(pdfMerger.getFileStream(), guid2Str(newGuid()) + '.pdf');            
        }        
    }
}
```
