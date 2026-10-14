export function App() {
  return (
    <main className="mx-auto flex min-h-svh max-w-3xl flex-col justify-center gap-4 px-4">
      <h1 className="text-2xl font-semibold">APIM Access Mapper</h1>
      <p className="text-muted-foreground">
        Maps Azure API Management policies to the Microsoft Entra identities allowed to call each
        operation.
      </p>
      <pre className="bg-log-background text-log-foreground rounded-md p-3 font-mono text-sm">
        {'> scaffold ready. no requests yet.'}
      </pre>
    </main>
  )
}
