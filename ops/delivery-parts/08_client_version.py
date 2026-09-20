from pathlib import Path

p=Path('.github/workflows/ci.yml');s=p.read_text()
anchor='      - run: npm ci'
if 'postgresql-client-17' not in s:
 s=s.replace(anchor, '''      - name: Use PostgreSQL 17 backup tools
        run: |
          if [ ! -x /usr/lib/postgresql/17/bin/pg_dump ]; then
            sudo apt-get update -qq
            sudo apt-get install -y postgresql-client-17
          fi
          echo /usr/lib/postgresql/17/bin >> "$GITHUB_PATH"
'''+anchor)
p.write_text(s)
p=Path('docs/SERVER_HANDOFF.md');s=p.read_text()
s+='\n## Backup client compatibility\n\nUse PostgreSQL client utilities from the same major version as the server, or a supported newer version. A PostgreSQL 16 pg_dump cannot back up a PostgreSQL 17 server. The doctor checks utility availability; validate pg_dump --version during provisioning. Test restoration into a separate empty database before relying on backups.\n'
p.write_text(s)
