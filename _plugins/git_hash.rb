module Jekyll
  class GitHashGenerator < Generator
    safe true
    priority :high

    def generate(site)
      hash = `git rev-parse --short HEAD`.strip rescue nil
      long_hash = `git rev-parse HEAD`.strip rescue nil
      date = `git log -1 --format=%cd --date=short`.strip rescue nil
      
      if hash
        site.config['git'] = {
          'hash' => hash,
          'long_hash' => long_hash,
          'date' => date
        }
      end
    end
  end
end
